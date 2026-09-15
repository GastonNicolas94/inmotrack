// services/punitorios.service.ts
import { Decimal } from "@prisma/client/runtime/client";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Clock } from "@/lib/clock";
import { AppClock } from "@/lib/app-clock";
import { calcularPendiente } from "@/lib/saldos";
import { calcularInteresAcumulado } from "@/lib/punitorios";
import { formatFechaLocal } from "@/lib/fecha";
import { admitePunitorio } from "@/lib/cargos";

type Dependencies = { prisma: PrismaClient; clock: Clock };

export function createPunitoriosService(deps: Dependencies) {
  return {
    async calcularIntereses(id_contrato: number, ids_cargo: number[], id_usuario_creador: number) {
      const { anio, mes, dia } = await deps.clock.today();
      const hoy = new Date(Date.UTC(anio, mes - 1, dia));
      const creadoEn = await deps.clock.now();

      let generados = 0;
      let montoTotal = new Decimal(0);

      for (const id_cargo of ids_cargo) {
        const nuevoCargo = await deps.prisma.$transaction(async (tx) => {
          await tx.$queryRawUnsafe(`SELECT id FROM cargos WHERE id = $1 FOR UPDATE`, id_cargo);
          const cargo = await tx.cargo.findUnique({
            where: { id: id_cargo },
            include: {
              aplicaciones: { include: { transaccion: { select: { fecha_transaccion: true } } } },
              periodo: { select: { periodo: true } },
              contrato: { select: { pct_punitorio_diario: true } },
              punitorios: {
                orderBy: { fecha_punitorio_hasta: "desc" },
                take: 1,
                select: { fecha_punitorio_hasta: true },
              },
            },
          });

          if (!cargo || cargo.id_contrato !== id_contrato || !admitePunitorio(cargo.tipo)) return null;

          const periodoAbierto = await tx.periodoPago.findFirst({
            where: { id_contrato: cargo.id_contrato, estado_ciclo: "ABIERTO" },
          });
          if (!periodoAbierto) return null;

          const pendiente = calcularPendiente(cargo.monto, cargo.aplicaciones);
          if (pendiente.lessThanOrEqualTo(0)) return null;

          let desde: Date;
          const ultimaHasta = cargo.punitorios[0]?.fecha_punitorio_hasta;
          if (ultimaHasta) {
            desde = new Date(Date.UTC(ultimaHasta.getUTCFullYear(), ultimaHasta.getUTCMonth(), ultimaHasta.getUTCDate() + 1));
          } else {
            const [anioPeriodo, mesPeriodo] = cargo.periodo.periodo.split("-").map(Number);
            desde = new Date(Date.UTC(anioPeriodo, mesPeriodo - 1, 1));
          }

          if (desde.getTime() > hoy.getTime()) return null;

          const monto = calcularInteresAcumulado(
            cargo.monto,
            cargo.aplicaciones,
            desde,
            hoy,
            cargo.contrato.pct_punitorio_diario,
          );

          return tx.cargo.create({
            data: {
              id_periodo: periodoAbierto.id,
              id_contrato: cargo.id_contrato,
              tipo: "PUNITORIO",
              monto,
              id_cargo_origen: cargo.id,
              fecha_punitorio_desde: desde,
              fecha_punitorio_hasta: hoy,
              creado_en: creadoEn,
              descripcion: `Intereses ${formatFechaLocal(desde)} al ${formatFechaLocal(hoy)}`,
            },
          });
        });

        if (nuevoCargo) {
          generados++;
          montoTotal = montoTotal.plus(nuevoCargo.monto);
        }
      }

      return { generados, monto_total: montoTotal };
    },
  };
}

export const PunitoriosService = createPunitoriosService({ prisma, clock: AppClock });
