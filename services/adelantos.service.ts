import { Decimal } from "@prisma/client/runtime/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type AdelantoPendiente = {
  id_transaccion: number;
  fecha_transaccion: Date;
  pendiente: Decimal;
};

export const AdelantosService = {
  /**
   * Registra un adelanto de plata a un propietario. Es una Transaccion
   * EGRESO_ADELANTO, caja TERCEROS, monto negativo — nunca se edita ni se
   * borra después; cualquier descuento futuro es un DeduccionAdelanto
   * nuevo, no una modificación de este registro.
   */
  async registrar(params: {
    id_propietario: number;
    monto: number | Decimal;
    id_usuario_creador: number;
  }) {
    const monto = new Decimal(params.monto);
    if (monto.lessThanOrEqualTo(0)) {
      throw new Error("El monto del adelanto debe ser mayor a cero.");
    }
    return prisma.transaccion.create({
      data: {
        tipo: "EGRESO_ADELANTO",
        caja_destino: "TERCEROS",
        monto: monto.negated(),
        id_propietario: params.id_propietario,
        id_usuario_creador: params.id_usuario_creador,
      },
    });
  },

  /**
   * Pendiente de cada adelanto del propietario (solo los que todavía tienen
   * saldo > 0), ordenados por antigüedad ascendente (el más viejo primero
   * — es el orden de prelación que usa LiquidacionesService al descontar),
   * más el total. Nunca se cachea: se recalcula siempre desde las
   * DeduccionAdelanto existentes.
   *
   * Acepta un `tx` opcional para poder llamarse dentro de la misma
   * transacción que genera una liquidación (mismo patrón que
   * aplicarCreditoDisponible en creditos.service.ts).
   */
  async obtenerPendiente(
    id_propietario: number,
    tx: Prisma.TransactionClient | typeof prisma = prisma
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
          new Decimal(0)
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
