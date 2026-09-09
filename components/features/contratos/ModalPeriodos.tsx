"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FilaResumenPeriodo } from "@/components/features/shared/FilaResumenPeriodo";
import { EstadoAsyncModal } from "@/components/features/shared/EstadoAsyncModal";

interface Periodo {
  id: number;
  periodo: string;
  estado_cobranza: string;
  fecha_vencimiento: string;
  saldo_pendiente: number | string;
}

interface Props {
  contratoId: number;
  label: string; // "Av. Corrientes 1234 — García"
}

export function ModalPeriodos({ contratoId, label }: Props) {
  const [open, setOpen] = useState(false);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/v1/contratos/${contratoId}/periodos`)
      .then((r) => r.json())
      .then(setPeriodos)
      .finally(() => setLoading(false));
  }, [open, contratoId]);

  function verDetalle() {
    setOpen(false);
    router.push(`/contratos/${contratoId}/movimientos`);
  }

  return (
    <>
      <Button size="sm" variant="outline" className="text-xs" onClick={() => setOpen(true)}>
        Períodos
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Períodos de pago</DialogTitle>
            <p className="text-sm text-muted-foreground">{label}</p>
          </DialogHeader>

          {loading ? (
            <EstadoAsyncModal mensaje="Cargando..." />
          ) : periodos.length === 0 ? (
            <EstadoAsyncModal mensaje="No hay períodos generados." />
          ) : (
            <div className="space-y-2">
              {periodos.map((p) => (
                <FilaResumenPeriodo
                  key={p.id}
                  periodo={p.periodo}
                  estado={p.estado_cobranza}
                  saldoPendiente={p.saldo_pendiente}
                  fechaVencimiento={p.fecha_vencimiento}
                  onClick={verDetalle}
                />
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
