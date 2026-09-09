"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function BotonMarcarPagado({ id }: { id: number }) {
  const router = useRouter();

  async function marcarPagado() {
    const res = await fetch(`/api/v1/gastos/${id}/marcar-pagado`, { method: "PATCH" });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.message ?? "Error al marcar como pagado.");
      return;
    }
    toast.success("Gasto marcado como pagado.");
    router.refresh();
  }

  return (
    <Button size="sm" variant="outline" className="text-xs" onClick={marcarPagado}>
      Marcar pagado
    </Button>
  );
}
