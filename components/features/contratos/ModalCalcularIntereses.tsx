"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { fmt } from "@/components/features/shared/PeriodoResumenRow";
import { EstadoAsyncModal } from "@/components/features/shared/EstadoAsyncModal";
import { etiquetaTipoCargo, type TipoCargoCodigo } from "@/lib/cargos";

interface Props {
  contrato: {
    id: number;
    inquilino: { nombre: string };
    propiedad: { direccion: string };
  };
}

interface CargoPendiente {
  id: number;
  tipo: TipoCargoCodigo;
  periodo: string;
  monto: number | string;
  pendiente: number | string;
}


export function ModalCalcularIntereses({ contrato }: Props) {
  const [open, setOpen] = useState(false);
  const [cargos, setCargos] = useState<CargoPendiente[]>([]);
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/v1/contratos/${contrato.id}/cargos-pendientes`)
      .then((r) => r.json())
      .then((data: { cargos: CargoPendiente[] }) => {
        // Un PUNITORIO nunca genera punitorio sobre sí mismo — no se
        // ofrece como opción, aunque tenga saldo pendiente.
        setCargos(data.cargos.filter((c) => c.tipo !== "PUNITORIO"));
      })
      .finally(() => setLoading(false));
  }, [open, contrato.id]);

  function toggle(id: number) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirmar() {
    if (seleccionados.size === 0) return;
    setEnviando(true);
    const res = await fetch(`/api/v1/contratos/${contrato.id}/calcular-intereses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids_cargo: Array.from(seleccionados) }),
    });
    setEnviando(false);

    if (!res.ok) {
      const err = await res.json();
      toast.error(err.message ?? "Error al calcular intereses.");
      return;
    }

    const data: { generados: number; monto_total: number } = await res.json();
    if (data.generados === 0) {
      toast.info("No había nada nuevo para calcular en los cargos seleccionados.");
    } else {
      toast.success(
        `Se generaron ${data.generados} cargo(s) de interés por un total de ${fmt(data.monto_total)}.`
      );
    }
    setOpen(false);
    setSeleccionados(new Set());
    router.refresh();
  }

  return (
    <>
      <Button size="sm" variant="outline" className="text-xs" onClick={() => setOpen(true)}>
        Calcular intereses
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Calcular intereses</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {contrato.propiedad.direccion} — {contrato.inquilino.nombre}
            </p>
          </DialogHeader>

          {loading ? (
            <EstadoAsyncModal mensaje="Cargando deuda..." />
          ) : cargos.length === 0 ? (
            <p className="text-center text-sm text-status-success py-2">Sin deuda pendiente.</p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Elegí sobre qué cargos calcular intereses. No seleccionar uno equivale a perdonarlo por
                ahora — se puede calcular más tarde sin perder nada de lo que ya se generó.
              </p>
              <div className="space-y-2">
                {cargos.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={seleccionados.has(c.id)}
                        onCheckedChange={() => toggle(c.id)}
                      />
                      <div>
                        <span className="font-mono font-medium">{c.periodo}</span>{" "}
                        <span className="text-xs text-muted-foreground">
                          {etiquetaTipoCargo(c.tipo)}
                        </span>
                      </div>
                    </div>
                    <div className="font-semibold text-status-danger">
                      Debe: <span className="font-mono">{fmt(c.pendiente)}</span>
                    </div>
                  </label>
                ))}
              </div>
              <Button
                className="w-full"
                disabled={seleccionados.size === 0 || enviando}
                onClick={confirmar}
              >
                {enviando ? "Calculando..." : "Confirmar cálculo"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
