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
        // quedado atascada para siempre (la función que la reclama se cae
        // a mitad de camino, timeoutea, o el proceso se redeploya) y no
        // existe ningún mecanismo que la saque de ese estado. Si se la
        // sigue excluyendo acá, ese contrato deja de cerrar períodos de
        // forma permanente y silenciosa. Encolar una fila PENDIENTE nueva
        // es inocuo aunque la PROCESANDO original todavía esté en curso de
        // verdad (no atascada): procesarUnaFilaDeCola relee el período
        // ABIERTO fresco antes de actuar, así que la fila "de más" hace
        // no-op y termina COMPLETADO sin duplicar nada — mismo argumento
        // ya aceptado para la ventana TOCTOU de este mismo método.
        outbox_cierre_periodo: { where: { estado: "PENDIENTE" } },
      },
    });

    let encolados = 0;
    let vencidos = 0;
    for (const contrato of contratos) {
      const { anio: finAnio, mes: finMes, dia: finDia } = partesFechaUTC(contrato.fecha_fin);
      const finStr = `${finAnio}-${String(finMes).padStart(2, "0")}-${String(finDia).padStart(2, "0")}`;

      if (finStr < hoyStr) {
        // El contrato ya terminó — sin un humano llamando avanzarPeriodo
        // a mano, nada frenaba que el cron le siguiera generando Cargo
        // ALQUILER + comisión mes tras mes para siempre. Se transiciona a
        // VENCIDO en vez de encolarse: no se toca el período abierto ni se
        // genera ningún cargo nuevo, y queda visible en la UI que este
        // contrato necesita revisión (renovar o rescindir).
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
    // Se calcula ANTES de reclamar cualquier fila y fuera del try/catch de
    // abajo: si FECHA_SIMULADA está mal configurada en producción (o tiene
    // un formato/rango inválido), hoyEnArgentina() tira, y ese error de
    // configuración de entorno debe propagarse tal cual (500 desde el
    // endpoint) — nunca quedar disfrazado de "error de negocio de esta
    // fila puntual" ni consumir uno de los 3 reintentos de una fila real.
    const { anio: anioActual, mes: mesActual } = hoyEnArgentina();
    const mesActualStr = `${anioActual}-${String(mesActual).padStart(2, "0")}`;

    // UPDATE atómico: FOR UPDATE SKIP LOCKED en la subconsulta + re-chequeo
    // de estado en el WHERE externo — dos invocaciones concurrentes nunca
    // toman la misma fila (spec, sección 2).
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
      // Doble chequeo: releer el período abierto fresco, y releer también
      // el estado ACTUAL del contrato (no el que tenía cuando se encoló
      // esta fila) — si en el medio pasó a RESCINDIDO/VENCIDO/BORRADOR,
      // esta consulta no lo encuentra, el while no entra, y la fila
      // termina COMPLETADO sin generarle cargos nuevos a un contrato que
      // ya no debería estar devengando. orderBy por determinismo si
      // alguna vez hubiera más de un período ABIERTO (no debería pasar,
      // pero findFirst sin orden es una lotería silenciosa si pasa).
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

        await ContratosService.avanzarPeriodo(fila.id_contrato, nuevoPeriodo, vencimiento);

        // Releer para la próxima vuelta del while — nunca calcular en base
        // al valor que ya tenía en memoria antes de esta llamada.
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
