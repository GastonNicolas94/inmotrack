import { cn } from "@/lib/utils";
import type { EstadoCobranza as Estado } from "@/lib/cobranzas";
const LABELS: Record<Estado, string> = {
  PENDIENTE: "En término",
  VENCIDO: "Vencido",
  COBRADO: "Cobrado",
};
export function EstadoCobranza({ estado }: { estado: Estado }) {
  return <span className={cn(
    "inline-flex items-center gap-1.5 rounded-[5px] px-2 py-1 text-[10px] font-bold",
    estado === "VENCIDO" ? "bg-brand-soft text-status-danger" : "bg-status-neutral-bg text-status-neutral",
  )}>
    <span aria-hidden="true" className="size-1 rounded-full bg-current" />
    {LABELS[estado]}
  </span>;
}
