"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

interface Propietario { id: number; nombre: string }

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export function ModalGenerarLiquidacion({ propietarios }: { propietarios: Propietario[] }) {
  const [open, setOpen] = useState(false);
  const [idPropietario, setIdPropietario] = useState<number | null>(null);
  const [hasta, setHasta] = useState(hoyISO());
  const [adelantoPendiente, setAdelantoPendiente] = useState(0);
  const [descontarAdelantos, setDescontarAdelantos] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!idPropietario) {
      setAdelantoPendiente(0);
      setDescontarAdelantos("");
      return;
    }
    fetch(`/api/v1/propietarios/${idPropietario}/adelantos`)
      .then((r) => r.json())
      .then((data) => setAdelantoPendiente(Number(data.total)))
      .catch(() => setAdelantoPendiente(0));
  }, [idPropietario]);

  async function generar() {
    if (!idPropietario) return;
    setLoading(true);
    const res = await fetch("/api/v1/liquidaciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id_propietario: idPropietario,
        hasta,
        descontar_adelantos: descontarAdelantos ? Number(descontarAdelantos) : 0,
      }),
    });
    setLoading(false);

    if (!res.ok) {
      const err = await res.json();
      toast.error(err.message ?? "Error al generar la liquidación.");
      return;
    }

    toast.success("Liquidación generada.");
    setOpen(false);
    setIdPropietario(null);
    setHasta(hoyISO());
    setDescontarAdelantos("");
    router.refresh();
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Generar liquidación</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Generar liquidación</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Select onValueChange={(v) => setIdPropietario(Number(v))}>
              <SelectTrigger><SelectValue placeholder="Seleccioná un propietario" /></SelectTrigger>
              <SelectContent>
                {propietarios.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Hasta</label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>

            {idPropietario && adelantoPendiente > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Descontar de adelantos (pendiente: {adelantoPendiente.toLocaleString("es-AR")})
                </label>
                <Input
                  type="number"
                  placeholder="0"
                  value={descontarAdelantos}
                  onChange={(e) => setDescontarAdelantos(e.target.value)}
                />
              </div>
            )}

            <Button className="w-full" disabled={!idPropietario || loading} onClick={generar}>
              {loading ? "Generando..." : "Generar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
