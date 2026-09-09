import { EstadoBadge } from "@/components/features/shared/EstadoBadge";

const COLORES: Record<string, string> = {
  BORRADOR: "bg-status-neutral-bg text-status-neutral hover:bg-status-neutral-bg",
  ACTIVO: "bg-status-success-bg text-status-success hover:bg-status-success-bg",
  MOROSO: "bg-status-warning-bg text-status-warning hover:bg-status-warning-bg",
  POR_VENCER: "bg-status-warning-bg text-status-warning hover:bg-status-warning-bg",
  VENCIDO: "bg-status-danger-bg text-status-danger hover:bg-status-danger-bg",
  RESCINDIDO: "bg-status-neutral-bg text-status-neutral/70 hover:bg-status-neutral-bg",
};

export function BadgeEstadoContrato({ estado }: { estado: string }) {
  return <EstadoBadge valor={estado} colores={COLORES} />;
}
