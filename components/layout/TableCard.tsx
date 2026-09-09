import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Contenedor estándar para las tablas de listado del dashboard:
 * toolbar opcional (acción de alta) + tabla con borde y radio consistentes.
 */
export function TableCard({
  action,
  children,
  className,
}: {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="space-y-4">
      {action && <div className="flex justify-end">{action}</div>}
      <div
        className={cn(
          "overflow-hidden rounded-2xl border border-border bg-card",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
