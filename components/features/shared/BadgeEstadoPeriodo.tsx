import { EstadoBadge } from "./EstadoBadge";

const COLORES: Record<string, string> = {
  PENDIENTE: "bg-status-neutral-bg text-status-neutral",
  PARCIAL: "bg-status-warning-bg text-status-warning",
  TOTAL: "bg-status-success-bg text-status-success",
  VENCIDO: "bg-status-danger-bg text-status-danger",
};

/** Estado de cobranza de un período de pago (alquiler o expensa). Compartido entre contratos e inquilinos. */
export function BadgeEstadoPeriodo({ estado }: { estado: string }) {
  return <EstadoBadge valor={estado} colores={COLORES} />;
}
