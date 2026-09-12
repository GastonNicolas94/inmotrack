import { Decimal } from "@prisma/client/runtime/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

// Revierte una transacción y, en cascada, cualquier transacción derivada de
// ella (encontrada por id_txn_origen — hoy solo comisiones, pero no hace
// falta saber de qué tipo es: cualquier cosa que en el futuro se genere como
// consecuencia de una transacción se revierte igual, sin tocar este código).
async function revertirTransaccion(
  tx: Prisma.TransactionClient,
  id_txn_origen: number,
  comentario: string,
  id_usuario_creador: number
) {
  const original = await tx.transaccion.findUniqueOrThrow({
    where: { id: id_txn_origen },
    include: {
      aplicaciones: { include: { cargo: { include: { periodo: true } } } },
      contra_asientos: true,
    },
  });

  // Una transacción se anula una sola vez. No hay campo "revertida" — la
  // fuente de verdad es la relación misma: si ya existe algún
  // CONTRA_ASIENTO apuntando a esta, no se genera otro.
  if (original.contra_asientos.some((t) => t.tipo === "CONTRA_ASIENTO")) {
    throw new Error("Esta transacción ya fue anulada, no se puede anular de nuevo.");
  }

  const contraAsiento = await tx.transaccion.create({
    data: {
      tipo: "CONTRA_ASIENTO",
      caja_destino: original.caja_destino,
      monto: new Decimal(original.monto).negated(),
      id_contrato: original.id_contrato,
      id_txn_origen: original.id,
      comentario,
      id_usuario_creador,
    },
  });

  for (const aplicacion of original.aplicaciones) {
    const monto = new Decimal(aplicacion.monto_aplicado);

    if (aplicacion.cargo.periodo.estado_ciclo === "CERRADO") {
      // El Cargo (y el período) del que colgaba la aplicación original
      // NUNCA se tocan: ni una AplicacionPago nueva ni ningún update.
      // La deuda revertida reaparece como un Cargo AJUSTE nuevo en el
      // período ABIERTO actual del mismo contrato, sin ninguna
      // aplicación propia — nace con su monto completo pendiente,
      // listo para que un pago futuro lo cubra.
      const periodoAbierto = await tx.periodoPago.findFirst({
        where: { id_contrato: aplicacion.cargo.id_contrato, estado_ciclo: "ABIERTO" },
      });
      if (!periodoAbierto) {
        throw new Error(
          "No hay período abierto en este contrato para aplicar el ajuste del contra-asiento."
        );
      }

      await tx.cargo.create({
        data: {
          id_periodo: periodoAbierto.id,
          id_contrato: aplicacion.cargo.id_contrato,
          tipo: "AJUSTE",
          monto,
          descripcion: `Reversa de pago aplicado a un período cerrado (${aplicacion.cargo.periodo.periodo})`,
        },
      });
    } else {
      // El período sigue abierto — se revierte directo contra el mismo Cargo.
      await tx.aplicacionPago.create({
        data: {
          id_transaccion: contraAsiento.id,
          id_cargo: aplicacion.id_cargo,
          monto_aplicado: monto.negated(),
        },
      });
    }
  }

  // Cualquier transacción derivada de la original (comisión sobre un cobro,
  // comisión sobre crédito heredado, o lo que sea que se genere en el
  // futuro) se revierte también, en cascada. Se excluyen otros
  // CONTRA_ASIENTO para no reprocesar una reversa ya existente.
  const derivadas = await tx.transaccion.findMany({
    where: { id_txn_origen: original.id, tipo: { not: "CONTRA_ASIENTO" } },
  });
  for (const derivada of derivadas) {
    await revertirTransaccion(tx, derivada.id, comentario, id_usuario_creador);
  }

  return contraAsiento;
}

export const TransaccionesService = {
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

    return prisma.$transaction((tx) =>
      revertirTransaccion(tx, id_txn_origen, comentario, id_usuario_creador)
    );
  },

  async listar(filtros?: {
    tipo?: string;
    caja_destino?: string;
    id_contrato?: number;
    desde?: Date;
    hasta?: Date;
  }) {
    return prisma.transaccion.findMany({
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
