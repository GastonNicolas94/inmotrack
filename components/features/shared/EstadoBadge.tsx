import { Badge } from "@/components/ui/badge";

/** Estados siempre con texto y punto; nunca comunicar el estado sólo con color. */
export function EstadoBadge({
  valor,
  colores,
  formatear = (v: string) => v.replace(/_/g, " "),
}: {
  valor: string;
  colores: Record<string, string>;
  formatear?: (v: string) => string;
}) {
  return (
    <Badge className={`gap-1.5 text-[10px] font-bold ${colores[valor] ?? "bg-status-neutral-bg text-status-neutral"}`}>
      <span aria-hidden="true" className="size-1 shrink-0 rounded-full bg-current" />
      {formatear(valor)}
    </Badge>
  );
}
