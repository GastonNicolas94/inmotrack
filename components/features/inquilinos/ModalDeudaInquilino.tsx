"use client";

import { useState, useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PeriodoResumenRow, fmt } from "@/components/features/shared/PeriodoResumenRow";
import { EstadoAsyncModal } from "@/components/features/shared/EstadoAsyncModal";

interface DetalleConcepto {
  id: number;
  concepto: string;
  monto: number;
  direccion: string;
}

interface Saldo {
  deuda_alquiler: number;
  punitorios: number;
  deuda_gastos: number;
  deuda_confeccion: number;
  total: number;
  detalle_periodos: {
    id: number;
    periodo: string;
    tipo: string;
    monto: number;
    pendiente: number;
    fecha_vencimiento: string;
  }[];
  detalle_gastos: DetalleConcepto[];
  detalle_confeccion: DetalleConcepto[];
}

function ListaConceptosPendientes({
  titulo,
  items,
}: {
  titulo: string;
  items: DetalleConcepto[];
}) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between rounded-xl border border-border p-2"
        >
          <div>
            <p className="text-sm font-medium">{item.concepto}</p>
            <p className="text-xs text-muted-foreground">{item.direccion}</p>
          </div>
          <p className="text-sm font-mono font-semibold text-status-danger">{fmt(item.monto)}</p>
        </div>
      ))}
    </div>
  );
}

export function ModalDeudaInquilino({
  inquilinoId,
  nombre,
}: {
  inquilinoId: number;
  nombre: string;
}) {
  const [open, setOpen] = useState(false);
  const [saldo, setSaldo] = useState<Saldo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/v1/inquilinos/${inquilinoId}/saldo`)
      .then((r) => r.json())
      .then(setSaldo)
      .finally(() => setLoading(false));
  }, [open, inquilinoId]);

  return (
    <>
      <Button size="sm" variant="outline" className="text-xs" onClick={() => setOpen(true)}>
        Ver deuda
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Deuda total — {nombre}</DialogTitle>
          </DialogHeader>

          {loading && <EstadoAsyncModal mensaje="Cargando..." />}

          {!loading && saldo && (
            <div className="space-y-5">
              {/* Resumen */}
              <div className="rounded-xl border border-border p-2 text-center">
                <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Total</p>
                <p className="text-sm font-mono mt-0.5 font-bold">{fmt(saldo.total)}</p>
              </div>

              {saldo.total === 0 && (
                <p className="flex items-center justify-center gap-1.5 text-center text-sm text-status-success py-2">
                  <CheckCircle2 className="size-4" /> Sin deuda pendiente.
                </p>
              )}

              {/* Períodos de alquiler, ajustes y punitorios */}
              {saldo.detalle_periodos.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Alquiler, ajustes y punitorios por período</h3>
                  {saldo.detalle_periodos.map((p) => (
                    <PeriodoResumenRow
                      key={p.id}
                      periodo={p.periodo}
                      tipo={p.tipo}
                      monto={p.monto}
                      pendiente={p.pendiente}
                      fechaVencimiento={p.fecha_vencimiento}
                    />
                  ))}
                </div>
              )}

              <ListaConceptosPendientes
                titulo="Confección de contrato"
                items={saldo.detalle_confeccion}
              />

              <ListaConceptosPendientes
                titulo="Gastos pendientes"
                items={saldo.detalle_gastos}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
