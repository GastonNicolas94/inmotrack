"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ellipsis, CheckCircle2, CircleCheckBig } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EnlaceDetalleLiquidacion } from "./EnlaceDetalleLiquidacion";

/** Detalle siempre visible; aprobación/pago solo según permisos y estado. */
export function BotonesLiquidacion({
  id,
  estado,
  puedeAprobar,
  esAdmin,
}: {
  id: number;
  estado: string;
  puedeAprobar: boolean;
  esAdmin: boolean;
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const puedeProcesar = (estado === "PENDIENTE" && puedeAprobar)
    || (estado === "APROBADA" && esAdmin);
  const label = estado === "PENDIENTE" ? "Aprobar liquidación" : "Confirmar pago";
  const url = estado === "PENDIENTE" ? "aprobar" : "confirmar-pago";

  async function realizarAccion() {
    if (!puedeProcesar || working) return;
    setWorking(true);
    try {
      const response = await fetch(`/api/v1/liquidaciones/${id}/${url}`, { method: "POST" });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        toast.error(error?.message ?? "No se pudo procesar la liquidación.");
        return;
      }
      toast.success(estado === "PENDIENTE" ? "Liquidación aprobada." : "Pago confirmado.");
      router.refresh();
    } catch {
      toast.error("No se pudo procesar la liquidación.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="contract-row-actions flex items-center justify-end gap-2">
      <div className="liquidation-main-action">
        <EnlaceDetalleLiquidacion id={id} />
      </div>
      {puedeProcesar ? (
        <DropdownMenu>
          <DropdownMenuTrigger title="Más acciones" aria-label={`Más acciones de liquidación ${id}`}
            disabled={working}
            className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50">
            <Ellipsis aria-hidden className="size-[18px]" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6}
            className="z-50 min-w-[200px] rounded-md border border-border bg-card p-1 shadow-[var(--shadow-soft)]">
            <DropdownMenuItem onClick={() => void realizarAccion()} disabled={working}
              className="min-h-10 gap-2 px-3 text-[12px]">
              {estado === "PENDIENTE" ? <CircleCheckBig aria-hidden className="size-4" /> : <CheckCircle2 aria-hidden className="size-4" />}
              {working ? "Procesando…" : label}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
