import { Badge } from "@/components/ui/badge";

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
    <Badge className={`text-xs ${colores[valor] ?? "bg-status-neutral-bg text-status-neutral"}`}>
      {formatear(valor)}
    </Badge>
  );
}
