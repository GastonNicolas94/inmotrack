import { EstadoBadge } from "@/components/features/shared/EstadoBadge";

const COLORES: Record<string, string> = {
  INGRESO_COBRO: "bg-status-success-bg text-status-success",
  INGRESO_COMISION: "bg-status-success-bg text-status-success",
  INGRESO_PUNITORIO: "bg-status-success-bg text-status-success",
  INGRESO_ALQUILER_PROPIO: "bg-status-success-bg text-status-success",
  EGRESO_LIQUIDACION: "bg-status-neutral-bg text-status-neutral",
  EGRESO_TERCEROS: "bg-status-neutral-bg text-status-neutral",
  EGRESO_OPERATIVO: "bg-status-neutral-bg text-status-neutral",
  CONTRA_ASIENTO: "bg-status-neutral-bg text-status-neutral",
};

export function BadgeTipoTransaccion({ tipo }: { tipo: string }) {
  return <EstadoBadge valor={tipo} colores={COLORES} />;
}
