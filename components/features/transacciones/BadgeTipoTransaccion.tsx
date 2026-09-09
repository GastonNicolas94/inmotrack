import { EstadoBadge } from "@/components/features/shared/EstadoBadge";

const COLORES: Record<string, string> = {
  INGRESO_COBRO: "bg-status-success-bg text-status-success",
  INGRESO_COMISION: "bg-status-success-bg text-status-success",
  INGRESO_PUNITORIO: "bg-status-success-bg text-status-success",
  INGRESO_ALQUILER_PROPIO: "bg-status-success-bg text-status-success",
  EGRESO_LIQUIDACION: "bg-status-danger-bg text-status-danger",
  EGRESO_TERCEROS: "bg-status-danger-bg text-status-danger",
  EGRESO_OPERATIVO: "bg-status-danger-bg text-status-danger",
  CONTRA_ASIENTO: "bg-status-neutral-bg text-status-neutral",
};

export function BadgeTipoTransaccion({ tipo }: { tipo: string }) {
  return <EstadoBadge valor={tipo} colores={COLORES} />;
}
