import { Decimal } from "@prisma/client/runtime/client";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Clock } from "@/lib/clock";
import { AppClock } from "@/lib/app-clock";
import { traceServiceObject } from "@/lib/observability/tracing";

async function revertirTransaccion(
  tx: Prisma.TransactionClient,
  id_txn_origen: number,
  comentario: string,
  id_usuario_creador: number,
  ahora: Date,
) {
  const original = await tx.transaccion.findUniqueOrThrow({
    where: { id: id_txn_origen },
    include: {
      aplicaciones: { include: { cargo: { include: { periodo: true } } } },
      contra_asientos: true,
    },
  });

  if (original.contra_asientos.some((t) => t.tipo === "CONTRA_ASIENTO")) {
    throw new Error("Esta transacción ya fue anulada, no se puede anular de nuevo.");
  }

  const contraAsiento = await tx.transaccion.create({
    data: {
      tipo: "CONTRA_ASIENTO",
      caja_destino: original.caja_destino,
      monto: new Decimal(original.monto).negated(),
      fecha_transaccion: ahora,
      id_contrato: original.id_contrato,
      id_txn_origen: original.id,
      comentario,
      id_usuario_creador,
    },
  });

  for (const aplicacion of original.aplicaciones) {
    const monto = new Decimal(aplicacion.monto_aplicado);

    if (aplicacion.cargo.periodo.estado_ciclo === "CERRADO") {
      const periodoAbierto = await tx.periodoPago.findFirst({
        where: { id_contrato: aplicacion.cargo.id_contrato, estado_ciclo: "ABIERTO" },
      });
      if (!periodoAbierto) {
        throw new Error("No hay período abierto en este contrato para aplicar el ajuste del contra-asiento.");
      }

      await tx.cargo.create({
        data: {
          id_periodo: periodoAbierto.id,
          id_contrato: aplicacion.cargo.id_contrato,
          tipo: "AJUSTE",
          monto,
          creado_en: ahora,
          descripcion: `Reversa de pago aplicado a un período cerrado (${aplicacion.cargo.periodo.periodo})`,
        },
      });
    } else {
      await tx.aplicacionPago.create({
        data: {
          id_transaccion: contraAsiento.id,
          id_cargo: aplicacion.id_cargo,
          monto_aplicado: monto.negated(),
        },
      });
    }
  }

  const derivadas = await tx.transaccion.findMany({
    where: { id_txn_origen: original.id, tipo: { not: "CONTRA_ASIENTO" } },
  });
  for (const derivada of derivadas) {
    await revertirTransaccion(tx, derivada.id, comentario, id_usuario_creador, ahora);
  }

  return contraAsiento;
}

type Dependencies = { prisma: PrismaClient; clock: Clock };

export function createTransaccionesService(deps: Dependencies) {
  return {
    async crearContraAsiento({
      id_txn_origen,
      comentario,
      id_usuario_creador,
    }: {
      id_txn_origen: number;
      comentario: string;
      id_usuario_creador: number;
    }) {
      if (!comentario || comentario.trim().length === 0) {
        throw new Error("El comentario es obligatorio para un contra-asiento.");
      }

      const ahora = await deps.clock.now();
      return deps.prisma.$transaction((tx) =>
        revertirTransaccion(tx, id_txn_origen, comentario, id_usuario_creador, ahora),
      );
    },

    async listar(filtros?: {
      tipo?: string;
      caja_destino?: string;
      id_contrato?: number;
      desde?: Date;
      hasta?: Date;
    }) {
      return deps.prisma.transaccion.findMany({
        where: {
          ...(filtros?.tipo ? { tipo: filtros.tipo as never } : {}),
          ...(filtros?.caja_destino ? { caja_destino: filtros.caja_destino as never } : {}),
          ...(filtros?.id_contrato ? { id_contrato: filtros.id_contrato } : {}),
          ...(filtros?.desde || filtros?.hasta
            ? {
                fecha_transaccion: {
                  ...(filtros.desde ? { gte: filtros.desde } : {}),
                  ...(filtros.hasta ? { lte: filtros.hasta } : {}),
                },
              }
            : {}),
        },
        select: {
          id: true,
          tipo: true,
          caja_destino: true,
          monto: true,
          fecha_transaccion: true,
          usuario_creador: { select: { email: true } },
          contra_asientos: { select: { id: true, tipo: true } },
        },
        orderBy: { fecha_transaccion: "desc" },
      });
    },
  };
}

export const TransaccionesService = traceServiceObject("TransaccionesService", createTransaccionesService({ prisma, clock: AppClock }));
