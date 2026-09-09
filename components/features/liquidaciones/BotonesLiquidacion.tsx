"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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

  async function aprobar() {
    const res = await fetch(`/api/v1/liquidaciones/${id}/aprobar`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.message ?? "Error al aprobar.");
      return;
    }
    toast.success("Liquidación aprobada.");
    router.refresh();
  }

  async function confirmarPago() {
    const res = await fetch(`/api/v1/liquidaciones/${id}/confirmar-pago`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.message ?? "Error al confirmar el pago.");
      return;
    }
    toast.success("Pago confirmado.");
    router.refresh();
  }

  if (estado === "PENDIENTE" && puedeAprobar) {
    return <Button size="sm" variant="outline" onClick={aprobar}>Aprobar</Button>;
  }
  if (estado === "APROBADA" && esAdmin) {
    return <Button size="sm" variant="outline" onClick={confirmarPago}>Confirmar pago</Button>;
  }
  return null;
}
