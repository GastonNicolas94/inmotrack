"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export function ModalRegistrarAdelanto({
  propietarioId,
  nombre,
}: {
  propietarioId: number;
  nombre: string;
}) {
  const [open, setOpen] = useState(false);
  const [monto, setMonto] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function registrar() {
    const montoNumerico = parseFloat(monto);
    if (Number.isNaN(montoNumerico) || montoNumerico <= 0) {
      toast.error("Ingresá un monto válido.");
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/v1/propietarios/${propietarioId}/adelantos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monto: montoNumerico }),
    });
    setLoading(false);

    if (!res.ok) {
      const err = await res.json();
      toast.error(err.message ?? "Error al registrar el adelanto.");
      return;
    }

    toast.success("Adelanto registrado.");
    setOpen(false);
    setMonto("");
    router.refresh();
  }

  return (
    <>
      <Button size="sm" variant="outline" className="text-xs" onClick={() => setOpen(true)}>
        Adelanto
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar adelanto — {nombre}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              type="number"
              placeholder="Monto"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
            <Button className="w-full" disabled={!monto || loading} onClick={registrar}>
              {loading ? "Registrando..." : "Registrar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
