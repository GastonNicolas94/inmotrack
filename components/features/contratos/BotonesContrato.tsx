"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ellipsis, CalendarDays, SlidersHorizontal, Calculator, Receipt, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { ModalRegistrarPago } from "@/components/features/pagos/ModalRegistrarPago";
import { ModalCargarGasto } from "@/components/features/gastos/ModalCargarGasto";
import { ModalCalcularIntereses } from "@/components/features/contratos/ModalCalcularIntereses";
import { ModalPeriodos } from "@/components/features/contratos/ModalPeriodos";
import { ModalAjustesContrato } from "@/components/features/contratos/ModalAjustesContrato";

type DialogAction = "periodos" | "ajustes" | "intereses" | "gasto" | null;

interface Props {
  id: number;
  estado: string;
  mostrarAcciones?: boolean;
  ajustePendiente?: {
    id: number;
    periodo_efectivo: string;
    indice: "ICL" | "IPC" | "ACUERDO";
    monto_anterior: number | string;
  } | null;
  contrato?: {
    id: number;
    inquilinoId: number;
    id_propiedad: number;
    inquilino: { nombre: string };
    propiedad: { direccion: string };
  };
}

/** One prominent action plus one contextual menu on both desktop and mobile.
 * Dialog components remain mounted OUTSIDE the menu portal, so opening a
 * dialog cannot unmount it when the dropdown closes.
 */
export function BotonesContrato({
  id, estado, mostrarAcciones = true, contrato, ajustePendiente = null,
}: Props) {
  const router = useRouter();
  const [activeDialog, setActiveDialog] = useState<DialogAction>(null);
  const [activating, setActivating] = useState(false);
  const label = contrato ? `${contrato.propiedad.direccion} — ${contrato.inquilino.nombre}` : `Contrato ${id}`;
  const canCharge = ["ACTIVO", "MOROSO", "POR_VENCER", "VENCIDO"].includes(estado);
  const canWriteForContract = mostrarAcciones && canCharge && Boolean(contrato);

  function closeDialog(next: boolean) {
    if (!next) setActiveDialog(null);
  }

  async function activar() {
    if (activating) return;
    setActivating(true);
    try {
      const response = await fetch(`/api/v1/contratos/${id}/activar`, { method: "POST" });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        toast.error(error?.message ?? "Error al activar.");
        return;
      }
      toast.success("Contrato activado. Primer período generado.");
      router.refresh();
    } catch {
      toast.error("No se pudo activar el contrato.");
    } finally {
      setActivating(false);
    }
  }

  return (
    <div className="contract-row-actions flex min-w-0 items-center justify-end gap-2">
      {estado === "BORRADOR" && mostrarAcciones ? (
        <Button size="sm" variant="outline" disabled={activating} className="contract-main-action h-9 rounded-md border-primary/20 bg-brand-soft px-3 font-semibold text-primary hover:bg-brand-soft/80"
          onClick={activar}>
          <Check aria-hidden className="size-4" />
          {activating ? "Activando…" : "Activar"}
        </Button>
      ) : null}
      {canWriteForContract && contrato ? (
        <ModalRegistrarPago contrato={contrato}
          triggerClassName="contract-main-action h-9 gap-2 rounded-md border-primary/20 bg-brand-soft px-3 text-[11px] font-semibold text-primary hover:bg-brand-soft/80" />
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Más acciones de ${label}`}
          title="Más acciones"
          className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Ellipsis aria-hidden className="size-[18px]" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6}
          className="z-50 min-w-[200px] rounded-md border border-border bg-card p-1 shadow-[var(--shadow-soft)]">
          <DropdownMenuItem className="min-h-10 gap-2 px-3 text-[12px]"
            onClick={() => setActiveDialog("periodos")}>
            <CalendarDays aria-hidden className="size-4" /> Ver períodos
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-10 gap-2 px-3 text-[12px]"
            onClick={() => setActiveDialog("ajustes")}>
            <SlidersHorizontal aria-hidden className="size-4" />
            {mostrarAcciones && ajustePendiente ? "Actualizar alquiler" : "Ver ajustes"}
          </DropdownMenuItem>
          {canWriteForContract && contrato ? (
            <>
              <DropdownMenuItem className="min-h-10 gap-2 px-3 text-[12px]"
                onClick={() => setActiveDialog("intereses")}>
                <Calculator aria-hidden className="size-4" /> Calcular intereses
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-10 gap-2 px-3 text-[12px]"
                onClick={() => setActiveDialog("gasto")}>
                <Receipt aria-hidden className="size-4" /> Registrar gasto
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Modals must stay mounted even after the menu unmounts its items. */}
      {activeDialog === "periodos" ? (
        <ModalPeriodos contratoId={id} label={label} hideTrigger
          controlledOpen onOpenChange={closeDialog} />
      ) : null}
      {activeDialog === "ajustes" ? (
        <ModalAjustesContrato contratoId={id} label={label} canWrite={mostrarAcciones}
          ajustePendiente={ajustePendiente} hideTrigger
          controlledOpen onOpenChange={closeDialog} />
      ) : null}
      {activeDialog === "intereses" && canWriteForContract && contrato ? (
        <ModalCalcularIntereses contrato={contrato} hideTrigger
          controlledOpen onOpenChange={closeDialog} />
      ) : null}
      {activeDialog === "gasto" && canWriteForContract && contrato ? (
        <ModalCargarGasto id_propiedad={contrato.id_propiedad} id_contrato={contrato.id}
          label={label} hideTrigger controlledOpen onOpenChange={closeDialog} />
      ) : null}
    </div>
  );
}
