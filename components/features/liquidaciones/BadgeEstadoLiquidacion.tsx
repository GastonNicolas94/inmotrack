import { EstadoBadge } from "@/components/features/shared/EstadoBadge";

const COLORES: Record<string, string> = {
  PENDIENTE: "bg-status-neutral-bg text-status-neutral",
  APROBADA: "bg-status-warning-bg text-status-warning",
  PAGADA: "bg-status-success-bg text-status-success",
};

export function BadgeEstadoLiquidacion({ estado }: { estado: string }) {
  return <EstadoBadge valor={estado} colores={COLORES} />;
}
