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
      {action && <div className="flex justify-stretch [&_[data-slot=button]]:min-h-12 [&_[data-slot=button]]:w-full sm:justify-end sm:[&_[data-slot=button]]:min-h-0 sm:[&_[data-slot=button]]:w-auto">{action}</div>}
      <div
        className={cn(
          "overflow-hidden rounded-lg border border-border bg-card",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
