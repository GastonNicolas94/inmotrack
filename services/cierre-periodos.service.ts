import { prisma } from "@/lib/db";
import { hoyEnArgentina, calcularVencimientoPeriodo, partesFechaUTC } from "@/lib/fecha";
import { ContratosService } from "@/services/contratos.service";

const MAX_INTENTOS = 3;

interface FilaOutbox {
  id: number;
  id_contrato: number;
  intentos: number;
}

export const CierrePeriodosService = {
  async encolarContratosVencidos() {
    const { anio, mes, dia } = hoyEnArgentina();
    const mesActual = `${anio}-${String(mes).padStart(2, "0")}`;
    const hoyStr = `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

    const contratos = await prisma.contrato.findMany({
      where: {
        estado: { in: ["ACTIVO", "MOROSO", "POR_VENCER"] },
        periodos_pago: {
          some: { estado_ciclo: "ABIERTO", periodo: { lt: mesActual } },
        },
      },
      include: {
        // Solo dedupe contra PENDIENTE — una fila PROCESANDO puede haber
        // quedado atascada para siempre. Encolar una fila PENDIENTE nueva
        // es inocuo: procesarUnaFilaDeCola relee el período ABIERTO fresco
        // antes de actuar y una fila de más termina como no-op.
        outbox_cierre_periodo: { where: { estado: "PENDIENTE" } },
      },
    });

    let encolados = 0;
    let vencidos = 0;
    for (const contrato of contratos) {
      const { anio: finAnio, mes: finMes, dia: finDia } = partesFechaUTC(contrato.fecha_fin);
      const finStr = `${finAnio}-${String(finMes).padStart(2, "0")}-${String(finDia).padStart(2, "0")}`;

      if (finStr < hoyStr) {
        // El contrato ya terminó: no se toca el período abierto ni se
        // generan cargos nuevos; queda VENCIDO para revisión humana.
        await prisma.contrato.update({
          where: { id: contrato.id },
          data: { estado: "VENCIDO" },
        });
        vencidos++;
        continue;
      }

      if (contrato.outbox_cierre_periodo.length > 0) continue;
      await prisma.outboxCierrePeriodo.create({
        data: { id_contrato: contrato.id, estado: "PENDIENTE" },
      });
      encolados++;
    }

    return { encolados, vencidos };
  },

  async procesarUnaFilaDeCola(): Promise<{ huboTrabajo: boolean }> {
    // Se calcula antes de reclamar una fila y fuera del try/catch: una
    // FECHA_SIMULADA inválida es un error de configuración global y no debe
    // consumir retries ni quedar disfrazada como error de negocio de una fila.
    const { anio: anioActual, mes: mesActual } = hoyEnArgentina();
    const mesActualStr = `${anioActual}-${String(mesActual).padStart(2, "0")}`;

    // UPDATE atómico: FOR UPDATE SKIP LOCKED + re-chequeo externo del
    // estado impiden que dos workers reclamen la misma fila.
    const filas = await prisma.$queryRawUnsafe<FilaOutbox[]>(`
      UPDATE outbox_cierre_periodo
      SET estado = 'PROCESANDO'
      WHERE id = (
        SELECT id FROM outbox_cierre_periodo
        WHERE estado = 'PENDIENTE'
        ORDER BY creado_en ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      AND estado = 'PENDIENTE'
      RETURNING id, id_contrato, intentos
    `);

    const fila = filas[0];
    if (!fila) return { huboTrabajo: false };

    try {
      // Releer período y estado ACTUAL del contrato. Si cambió a un estado
      // que ya no devenga, el loop no entra y la fila termina COMPLETADO.
      let periodoAbierto = await prisma.periodoPago.findFirst({
        where: {
          id_contrato: fila.id_contrato,
          estado_ciclo: "ABIERTO",
          contrato: { estado: { in: ["ACTIVO", "MOROSO", "POR_VENCER"] } },
        },
        orderBy: { periodo: "asc" },
      });

      while (periodoAbierto && periodoAbierto.periodo < mesActualStr) {
        const [anioP, mesP] = periodoAbierto.periodo.split("-").map(Number);
        let anioSiguiente = anioP;
        let mesSiguiente = mesP + 1;
        if (mesSiguiente > 12) {
          mesSiguiente = 1;
          anioSiguiente += 1;
        }
        const nuevoPeriodo = `${anioSiguiente}-${String(mesSiguiente).padStart(2, "0")}`;
        const vencimiento = calcularVencimientoPeriodo(anioSiguiente, mesSiguiente);

        const resultado = await ContratosService.avanzarPeriodo(
          fila.id_contrato,
          nuevoPeriodo,
          vencimiento,
        );

        // Un ajuste pendiente es una condición funcional esperada: el
        // período actual queda ABIERTO, no consume retries y el worker se
        // detiene exactamente antes del período que necesita actualización.
        if (resultado.estado === "AJUSTE_PENDIENTE") {
          break;
        }

        // Releer el período abierto fresco para la próxima vuelta. Nunca
        // calcular el catch-up desde estado viejo retenido en memoria.
        periodoAbierto = await prisma.periodoPago.findFirst({
          where: {
            id_contrato: fila.id_contrato,
            estado_ciclo: "ABIERTO",
            contrato: { estado: { in: ["ACTIVO", "MOROSO", "POR_VENCER"] } },
          },
          orderBy: { periodo: "asc" },
        });
      }

      await prisma.outboxCierrePeriodo.update({
        where: { id: fila.id },
        data: { estado: "COMPLETADO", procesado_en: new Date() },
      });
    } catch (e) {
      const intentos = fila.intentos + 1;
      if (intentos < MAX_INTENTOS) {
        await prisma.outboxCierrePeriodo.update({
          where: { id: fila.id },
          data: { estado: "PENDIENTE", intentos },
        });
      } else {
        await prisma.outboxCierrePeriodo.update({
          where: { id: fila.id },
          data: { estado: "ERROR", intentos, error: String(e) },
        });
      }
    }

    return { huboTrabajo: true };
  },
};
