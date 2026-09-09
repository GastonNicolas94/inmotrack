import { Decimal } from "@prisma/client/runtime/client";
import { partesFechaUTC } from "@/lib/fecha";

export type EstrategiaConfeccion = "UN_ALQUILER" | "PORCENTAJE_5";

/**
 * Cantidad de meses completos del contrato, contando el mes de inicio y el
 * de fin (ej. agosto 2026 a julio 2028 → 24 meses). Getters UTC, mismo
 * motivo que en lib/fecha.ts — fecha_inicio/fecha_fin son @db.Date.
 */
export function mesesDuracionContrato(
  fecha_inicio: Date | string,
  fecha_fin: Date | string
): number {
  const inicio = partesFechaUTC(fecha_inicio);
  const fin = partesFechaUTC(fecha_fin);
  return (fin.anio - inicio.anio) * 12 + (fin.mes - inicio.mes) + 1;
}

/**
 * Monto de la confección de contrato, según la estrategia elegida:
 * - UN_ALQUILER: el valor de un mes de alquiler.
 * - PORCENTAJE_5: 5% del "contrato total" (alquiler mensual × meses de duración).
 */
export function calcularMontoConfeccion(params: {
  estrategia: EstrategiaConfeccion;
  monto_base: Decimal | string | number;
  fecha_inicio: Date | string;
  fecha_fin: Date | string;
}): Decimal {
  const montoBase = new Decimal(params.monto_base);
  if (params.estrategia === "UN_ALQUILER") return montoBase;

  const meses = mesesDuracionContrato(params.fecha_inicio, params.fecha_fin);
  return montoBase.times(meses).times(0.05);
}
