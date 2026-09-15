"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EstadoAsyncModal } from "@/components/features/shared/EstadoAsyncModal";
import { toast } from "sonner";

interface AjusteContratoDto {
  id: number;
  periodo_efectivo: string;
  indice: "ICL" | "IPC" | "ACUERDO";
  monto_anterior: string;
  monto_nuevo: string | null;
  estado: "PENDIENTE" | "APLICADO";
  observacion: string | null;
  creado_en: string;
  aplicado_en: string | null;
  usuario_aplicador: { id: number; email: string } | null;
}

interface Props {
  contratoId: number;
  label: string;
  canWrite: boolean;
  ajustePendiente?: {
    id: number;
    periodo_efectivo: string;
    indice: "ICL" | "IPC" | "ACUERDO";
    monto_anterior: number | string;
  } | null;
}

const ars = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

function formatMonto(value: number | string) {
  return ars.format(Number(value));
}

export function ModalAjustesContrato({ contratoId, label, canWrite, ajustePendiente }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [ajustes, setAjustes] = useState<AjusteContratoDto[]>([]);
  const [montoNuevo, setMontoNuevo] = useState("");
  const [observacion, setObservacion] = useState("");
  const router = useRouter();

  async function cargar() {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/contratos/${contratoId}/ajustes`);
      if (!res.ok) throw new Error("No se pudo cargar el historial de ajustes.");
      setAjustes(await res.json());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cargar el historial.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    void cargar();
  }, [open, contratoId]);

  async function aplicar() {
    if (!ajustePendiente || !montoNuevo) return;
    const numero = Number(montoNuevo);
    if (!Number.isFinite(numero) || numero <= 0) {
      toast.error("Ingresá un monto mayor a 0.");
      return;
    }

    setEnviando(true);
    const res = await fetch(
      `/api/v1/contratos/${contratoId}/ajustes/${ajustePendiente.id}/aplicar`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monto_nuevo: numero,
          observacion: observacion.trim() || undefined,
        }),
      },
    );
    setEnviando(false);

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      toast.error(err?.message ?? "No se pudo aplicar el ajuste.");
      return;
    }

    toast.success("Alquiler actualizado. El cierre automático continuará con el nuevo monto.");
    setMontoNuevo("");
    setObservacion("");
    await cargar();
    router.refresh();
  }

  return (
    <>
      <Button
        size="sm"
        variant={ajustePendiente && canWrite ? "default" : "outline"}
        className="text-xs"
        onClick={() => setOpen(true)}
      >
        {ajustePendiente && canWrite ? "Actualizar alquiler" : "Ajustes"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Actualizaciones de alquiler</DialogTitle>
            <p className="text-sm text-muted-foreground">{label}</p>
          </DialogHeader>

          {ajustePendiente ? (
            <section className="space-y-4 rounded-2xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Ajuste pendiente · {ajustePendiente.periodo_efectivo}</p>
                  <p className="text-sm text-muted-foreground">
                    {ajustePendiente.indice} · monto vigente {formatMonto(ajustePendiente.monto_anterior)}
                  </p>
                </div>
                <span className="rounded-full bg-status-warning-bg px-2.5 py-1 text-xs font-medium text-status-warning">
                  Pendiente
                </span>
              </div>

              {canWrite ? (
                <div className="space-y-3">
                  <label className="block space-y-1.5 text-sm">
                    <span className="font-medium">Nuevo monto</span>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={montoNuevo}
                      onChange={(event) => setMontoNuevo(event.target.value)}
                      placeholder="Ej. 600000"
                    />
                  </label>
                  <label className="block space-y-1.5 text-sm">
                    <span className="font-medium">Observación</span>
                    <Textarea
                      value={observacion}
                      onChange={(event) => setObservacion(event.target.value)}
                      maxLength={500}
                      placeholder="Opcional"
                    />
                  </label>
                  <Button className="w-full" disabled={enviando || !montoNuevo} onClick={aplicar}>
                    {enviando ? "Aplicando..." : "Aplicar actualización"}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Tu rol puede consultar el ajuste, pero no aplicarlo.</p>
              )}
            </section>
          ) : null}

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Historial</h3>
            {loading ? (
              <EstadoAsyncModal mensaje="Cargando ajustes..." />
            ) : ajustes.length === 0 ? (
              <p className="rounded-xl border border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Este contrato todavía no tiene actualizaciones registradas.
              </p>
            ) : (
              <div className="divide-y divide-border rounded-2xl border border-border px-4">
                {ajustes.map((ajuste) => (
                  <div key={ajuste.id} className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">{ajuste.periodo_efectivo} · {ajuste.indice}</p>
                      <p className="text-muted-foreground">
                        {formatMonto(ajuste.monto_anterior)}
                        {ajuste.monto_nuevo ? ` → ${formatMonto(ajuste.monto_nuevo)}` : " → pendiente"}
                      </p>
                      {ajuste.observacion ? <p className="mt-1 text-xs text-muted-foreground">{ajuste.observacion}</p> : null}
                    </div>
                    <div className="text-xs text-muted-foreground sm:text-right">
                      <span className={ajuste.estado === "PENDIENTE" ? "text-status-warning" : "text-status-success"}>
                        {ajuste.estado === "PENDIENTE" ? "Pendiente" : "Aplicado"}
                      </span>
                      {ajuste.usuario_aplicador ? <span className="block">{ajuste.usuario_aplicador.email}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </DialogContent>
      </Dialog>
    </>
  );
}
