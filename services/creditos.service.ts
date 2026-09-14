import { Decimal } from "@prisma/client/runtime/client";
import type { Prisma } from "@prisma/client";
import { calcularPendiente } from "@/lib/saldos";
import type { TipoCargoCodigo } from "@/lib/cargos";

/**
 * Busca crédito disponible del contrato (sobrante sin aplicar en cualquier
 * Transaccion de cobro — a lo sumo una a la vez, por invariante del sistema,
 * pero se recorre sin asumirlo) y lo aplica contra el Cargo indicado, hasta
 * cubrirlo por completo o hasta agotar el crédito disponible, lo que pase
 * primero. Si sobra crédito después de cubrir el Cargo, se queda flotando
 * en la misma Transaccion de origen — nunca se pierde, nunca se cachea.
 *
 * La comisión sobre lo aplicado se genera recién en este momento (nunca
 * antes), y solo si el Cargo es de tipo ALQUILER. Si el Cargo es una
 * confección de contrato, se reconoce el ingreso operativo por el importe
 * aplicado, igual que en PagosService.registrar.
 *
 * Se llama en cualquier lugar donde nace un Cargo que el inquilino puede
 * deber: al abrir un período nuevo (ContratosService.abrirPeriodo) y al
 * cargar un gasto a cargo del inquilino (GastosService.crear).
 */
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
            id_contrato: params.id_contrato,
            id_usuario_creador: params.id_usuario_creador,
            // Misma traza que en PagosService.registrar: esta comisión
            // existe porque se aplicó el sobrante de este cobro.
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
          id_contrato: params.id_contrato,
          id_usuario_creador: params.id_usuario_creador,
          id_txn_origen: cobro.id,
        },
      });
    }
  }
}
