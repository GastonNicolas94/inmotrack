import { Decimal } from "@prisma/client/runtime/client";
import { calcularPendiente } from "@/lib/saldos";

export type EstadoCobranza = "PENDIENTE" | "PARCIAL" | "TOTAL" | "VENCIDO";

export function calcularEstadoCobranza(params: {
  montoTotal: Decimal;
  montoPendiente: Decimal;
  vencido: boolean;
}): EstadoCobranza {
  const { montoTotal, montoPendiente, vencido } = params;

  if (montoPendiente.lessThanOrEqualTo(0)) return "TOTAL";
  if (vencido) return "VENCIDO";
  if (montoPendiente.lessThan(montoTotal)) return "PARCIAL";
  return "PENDIENTE";
}

/**
 * Mismo cálculo que `calcularEstadoCobranza`, pero a partir de un Cargo
 * (con sus aplicaciones) en vez de montoTotal/montoPendiente ya resueltos —
 * evita repetir `calcularPendiente(...)` + armar el objeto en cada lugar
 * que necesita el estado de un Cargo puntual.
 */
export function estadoCobranzaCargo(
  cargo: { monto: Decimal | string | number; aplicaciones: { monto_aplicado: Decimal | string | number }[] },
  vencido: boolean
): EstadoCobranza {
  const montoPendiente = calcularPendiente(cargo.monto, cargo.aplicaciones);
  return calcularEstadoCobranza({ montoTotal: new Decimal(cargo.monto), montoPendiente, vencido });
}

export type EstadoLiquidacionCargo = "SIN_COBRAR" | "COBRADO_SIN_LIQUIDAR" | "PARCIAL" | "LIQUIDADO";

/**
 * Estado de liquidación de un Cargo — independiente de si está cobrado o no
 * (ver estadoCobranzaCargo para eso). Se deriva de cuántas de sus
 * AplicacionPago ya fueron selladas con un id_liquidacion_item, nunca se
 * cachea.
 *
 * - SIN_COBRAR: el Cargo no tiene ninguna AplicacionPago todavía.
 * - COBRADO_SIN_LIQUIDAR: tiene aplicaciones, pero ninguna está liquidada.
 * - PARCIAL: mezcla — algunas aplicaciones liquidadas, otras no.
 * - LIQUIDADO: todas sus aplicaciones ya están liquidadas.
 */
export function estadoLiquidacionCargo(
  cargo: { aplicaciones: { id_liquidacion_item: number | null }[] }
): EstadoLiquidacionCargo {
  if (cargo.aplicaciones.length === 0) return "SIN_COBRAR";

  const liquidadas = cargo.aplicaciones.filter((a) => a.id_liquidacion_item !== null).length;

  if (liquidadas === 0) return "COBRADO_SIN_LIQUIDAR";
  if (liquidadas === cargo.aplicaciones.length) return "LIQUIDADO";
  return "PARCIAL";
}
