import { Decimal } from "@prisma/client/runtime/client";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Clock } from "@/lib/clock";
import { AppClock } from "@/lib/app-clock";
import { traceServiceObject } from "@/lib/observability/tracing";

export type AdelantoPendiente = {
  id_transaccion: number;
  fecha_transaccion: Date;
  pendiente: Decimal;
};

type Dependencies = { prisma: PrismaClient; clock: Clock };

export function createAdelantosService(deps: Dependencies) {
  return {
    async registrar(params: {
      id_propietario: number;
      monto: number | Decimal;
      id_usuario_creador: number;
    }) {
      const monto = new Decimal(params.monto);
      if (monto.lessThanOrEqualTo(0)) {
        throw new Error("El monto del adelanto debe ser mayor a cero.");
      }
      const ahora = await deps.clock.now();
      return deps.prisma.transaccion.create({
        data: {
          tipo: "EGRESO_ADELANTO",
          caja_destino: "TERCEROS",
          monto: monto.negated(),
          fecha_transaccion: ahora,
          id_propietario: params.id_propietario,
          id_usuario_creador: params.id_usuario_creador,
        },
      });
    },

    async obtenerPendiente(
      id_propietario: number,
      tx: Prisma.TransactionClient | PrismaClient = deps.prisma,
    ): Promise<{ total: Decimal; detalle: AdelantoPendiente[] }> {
      const adelantos = await tx.transaccion.findMany({
        where: { id_propietario, tipo: "EGRESO_ADELANTO" },
        include: { deducciones: true },
        orderBy: { fecha_transaccion: "asc" },
      });

      const detalle: AdelantoPendiente[] = adelantos
        .map((a) => {
          const descontado = a.deducciones.reduce(
            (acc, d) => acc.plus(d.monto_descontado),
            new Decimal(0),
          );
          return {
            id_transaccion: a.id,
            fecha_transaccion: a.fecha_transaccion,
            pendiente: new Decimal(a.monto).abs().minus(descontado),
          };
        })
        .filter((d) => d.pendiente.greaterThan(0));

      const total = detalle.reduce((acc, d) => acc.plus(d.pendiente), new Decimal(0));
      return { total, detalle };
    },
  };
}

export const AdelantosService = traceServiceObject("AdelantosService", createAdelantosService({ prisma, clock: AppClock }));
