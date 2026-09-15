import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Clock } from "@/lib/clock";
import { AppClock } from "@/lib/app-clock";
import { calcularVencimientoPeriodo, partesFechaUTC } from "@/lib/fecha";
import { ContratosService } from "@/services/contratos.service";

const MAX_INTENTOS = 3;

interface FilaOutbox {
  id: number;
  id_contrato: number;
  intentos: number;
}

type Dependencies = { prisma: PrismaClient; clock: Clock };

export function createCierrePeriodosService(deps: Dependencies) {
  return {
    async encolarContratosVencidos() {
      const { anio, mes, dia } = await deps.clock.today();
      const ahora = await deps.clock.now();
      const mesActual = `${anio}-${String(mes).padStart(2, "0")}`;
      const hoyStr = `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

      const contratos = await deps.prisma.contrato.findMany({
        where: {
          estado: { in: ["ACTIVO", "MOROSO", "POR_VENCER"] },
          periodos_pago: {
            some: { estado_ciclo: "ABIERTO", periodo: { lt: mesActual } },
          },
        },
        include: {
          outbox_cierre_periodo: { where: { estado: "PENDIENTE" } },
        },
      });

      let encolados = 0;
      let vencidos = 0;
      for (const contrato of contratos) {
        const { anio: finAnio, mes: finMes, dia: finDia } = partesFechaUTC(contrato.fecha_fin);
        const finStr = `${finAnio}-${String(finMes).padStart(2, "0")}-${String(finDia).padStart(2, "0")}`;

        if (finStr < hoyStr) {
          await deps.prisma.contrato.update({
            where: { id: contrato.id },
            data: { estado: "VENCIDO" },
          });
          vencidos++;
          continue;
        }

        if (contrato.outbox_cierre_periodo.length > 0) continue;
        await deps.prisma.outboxCierrePeriodo.create({
          data: { id_contrato: contrato.id, estado: "PENDIENTE", creado_en: ahora },
        });
        encolados++;
      }

      return { encolados, vencidos };
    },

    async procesarUnaFilaDeCola(): Promise<{ huboTrabajo: boolean }> {
      const { anio: anioActual, mes: mesActual } = await deps.clock.today();
      const procesadoEn = await deps.clock.now();
      const mesActualStr = `${anioActual}-${String(mesActual).padStart(2, "0")}`;

      const filas = await deps.prisma.$queryRawUnsafe<FilaOutbox[]>(`
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
        let periodoAbierto = await deps.prisma.periodoPago.findFirst({
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

          if (resultado.estado === "AJUSTE_PENDIENTE") break;

          periodoAbierto = await deps.prisma.periodoPago.findFirst({
            where: {
              id_contrato: fila.id_contrato,
              estado_ciclo: "ABIERTO",
              contrato: { estado: { in: ["ACTIVO", "MOROSO", "POR_VENCER"] } },
            },
            orderBy: { periodo: "asc" },
          });
        }

        await deps.prisma.outboxCierrePeriodo.update({
          where: { id: fila.id },
          data: { estado: "COMPLETADO", procesado_en: procesadoEn },
        });
      } catch (e) {
        const intentos = fila.intentos + 1;
        if (intentos < MAX_INTENTOS) {
          await deps.prisma.outboxCierrePeriodo.update({
            where: { id: fila.id },
            data: { estado: "PENDIENTE", intentos },
          });
        } else {
          await deps.prisma.outboxCierrePeriodo.update({
            where: { id: fila.id },
            data: { estado: "ERROR", intentos, error: String(e) },
          });
        }
      }

      return { huboTrabajo: true };
    },
  };
}

export const CierrePeriodosService = createCierrePeriodosService({ prisma, clock: AppClock });
