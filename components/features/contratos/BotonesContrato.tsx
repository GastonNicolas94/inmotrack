"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ModalRegistrarPago } from "@/components/features/pagos/ModalRegistrarPago";
import { ModalCargarGasto } from "@/components/features/gastos/ModalCargarGasto";
import { ModalCalcularIntereses } from "@/components/features/contratos/ModalCalcularIntereses";

interface Props {
  id: number;
  estado: string;
  mostrarAcciones?: boolean;
  contrato?: {
    id: number;
    inquilinoId: number;
    id_propiedad: number;
    inquilino: { nombre: string };
    propiedad: { direccion: string };
  };
}

export function BotonesContrato({ id, estado, mostrarAcciones = true, contrato }: Props) {
  const router = useRouter();
  if (!mostrarAcciones) return null;

  async function activar() {
    const res = await fetch(`/api/v1/contratos/${id}/activar`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.message ?? "Error al activar.");
      return;
    }
    toast.success("Contrato activado. Primer período generado.");
    router.refresh();
  }

  if (estado === "BORRADOR") {
    return (
      <Button size="sm" variant="outline" onClick={activar}>
        Activar
      </Button>
    );
  }

  if (
    (estado === "ACTIVO" || estado === "MOROSO" || estado === "POR_VENCER" || estado === "VENCIDO") &&
    contrato
  ) {
    return (
      <div className="flex items-center gap-1">
        <ModalRegistrarPago contrato={contrato} />
        <ModalCalcularIntereses contrato={contrato} />
        <ModalCargarGasto
          id_propiedad={contrato.id_propiedad}
          id_contrato={contrato.id}
          label={`${contrato.propiedad.direccion} — ${contrato.inquilino.nombre}`}
          triggerLabel="Gasto"
          triggerVariant="outline"
          triggerSize="sm"
        />
      </div>
    );
  }

  return null;
}
