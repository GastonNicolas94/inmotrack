import { Decimal } from "@prisma/client/runtime/client";
import type { Prisma } from "@prisma/client";
import { calcularPendiente } from "@/lib/saldos";
import type { TipoCargoCodigo } from "@/lib/cargos";

export async function aplicarCreditoDisponible(
  tx: Prisma.TransactionClient,
  params: {
    id_contrato: number;
    id_cargo: number;
    tipo_cargo: TipoCargoCodigo;
    pendiente_cargo: Decimal;
    pct_comision: Decimal;
    es_propia: boolean;
    id_usuario_creador: number | null;
    fecha_transaccion?: Date;
  }
) {
  let pendiente = params.pendiente_cargo;
  if (pendiente.lessThanOrEqualTo(0)) return;

  const cobros = await tx.transaccion.findMany({
    where: { id_contrato: params.id_contrato, tipo: "INGRESO_COBRO" },
    include: { aplicaciones: true },
    orderBy: { fecha_transaccion: "asc" },
  });

  for (const cobro of cobros) {
    if (pendiente.lessThanOrEqualTo(0)) break;

    const disponible = calcularPendiente(cobro.monto, cobro.aplicaciones);
    if (disponible.lessThanOrEqualTo(0)) continue;

    const abono = Decimal.min(disponible, pendiente);
    await tx.aplicacionPago.create({
      data: { id_transaccion: cobro.id, id_cargo: params.id_cargo, monto_aplicado: abono },
    });
    pendiente = pendiente.minus(abono);

    if (params.tipo_cargo === "ALQUILER") {
      const montoComision = abono.times(params.pct_comision).dividedBy(100);
      if (montoComision.greaterThan(0)) {
        await tx.transaccion.create({
          data: {
            tipo: params.es_propia ? "INGRESO_ALQUILER_PROPIO" : "INGRESO_COMISION",
            caja_destino: "OPERATIVA",
            monto: montoComision,
            ...(params.fecha_transaccion ? { fecha_transaccion: params.fecha_transaccion } : {}),
            id_contrato: params.id_contrato,
            id_usuario_creador: params.id_usuario_creador,
            id_txn_origen: cobro.id,
          },
        });
      }
    } else if (params.tipo_cargo === "CONFECCION_CONTRATO") {
      await tx.transaccion.create({
        data: {
          tipo: "INGRESO_CONFECCION_CONTRATO",
          caja_destino: "OPERATIVA",
          monto: abono,
          ...(params.fecha_transaccion ? { fecha_transaccion: params.fecha_transaccion } : {}),
          id_contrato: params.id_contrato,
          id_usuario_creador: params.id_usuario_creador,
          id_txn_origen: cobro.id,
        },
      });
    }
  }
}
