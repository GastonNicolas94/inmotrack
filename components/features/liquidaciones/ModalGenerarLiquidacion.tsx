"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

interface Propietario { id: number; nombre: string }

interface ConceptoPendiente {
  tipo: "ALQUILER" | "GASTO";
  id: number;
  fecha: string;
  propiedad: { id: number; direccion: string };
  periodo: string | null;
  concepto: string;
  porcentaje_participacion: string;
  monto: string;
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function claveConcepto(concepto: Pick<ConceptoPendiente, "tipo" | "id">) {
  return `${concepto.tipo}:${concepto.id}`;
}

function formatMonto(value: string) {
  return Number(value).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  });
}

export function ModalGenerarLiquidacion({ propietarios }: { propietarios: Propietario[] }) {
  const [open, setOpen] = useState(false);
  const [idPropietario, setIdPropietario] = useState<number | null>(null);
  const [hasta, setHasta] = useState(hoyISO());
  const [adelantoPendiente, setAdelantoPendiente] = useState(0);
  const [descontarAdelantos, setDescontarAdelantos] = useState("");
  const [pendientes, setPendientes] = useState<ConceptoPendiente[]>([]);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [loadingPendientes, setLoadingPendientes] = useState(false);
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

  useEffect(() => {
    if (!idPropietario || !hasta) {
      setPendientes([]);
      setSeleccionados(new Set());
      return;
    }

    let cancelled = false;
    setLoadingPendientes(true);
    fetch(
      `/api/v1/liquidaciones/pendientes?id_propietario=${idPropietario}&hasta=${encodeURIComponent(hasta)}`,
    )
      .then(async (res) => {
        if (!res.ok) throw new Error("No se pudieron cargar los conceptos pendientes.");
        return res.json() as Promise<ConceptoPendiente[]>;
      })
      .then((data) => {
        if (cancelled) return;
        setPendientes(data);
        setSeleccionados(new Set());
      })
      .catch((error) => {
        if (cancelled) return;
        setPendientes([]);
        setSeleccionados(new Set());
        toast.error(error instanceof Error ? error.message : "Error cargando pendientes.");
      })
      .finally(() => {
        if (!cancelled) setLoadingPendientes(false);
      });

    return () => {
      cancelled = true;
    };
  }, [idPropietario, hasta]);

  function toggleConcepto(concepto: ConceptoPendiente) {
    const key = claveConcepto(concepto);
    setSeleccionados((actuales) => {
      const next = new Set(actuales);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function seleccionarTodos() {
    setSeleccionados(new Set(pendientes.map(claveConcepto)));
  }

  function limpiarSeleccion() {
    setSeleccionados(new Set());
  }

  async function generar() {
    if (!idPropietario) return;

    const conceptos = pendientes
      .filter((concepto) => seleccionados.has(claveConcepto(concepto)))
      .map(({ tipo, id }) => ({ tipo, id }));
    const montoAdelantos = descontarAdelantos ? Number(descontarAdelantos) : 0;

    if (conceptos.length === 0 && montoAdelantos <= 0) {
      toast.error("Seleccioná al menos un concepto o un adelanto para descontar.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/v1/liquidaciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id_propietario: idPropietario,
        hasta,
        descontar_adelantos: montoAdelantos,
        conceptos,
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
    setPendientes([]);
    setSeleccionados(new Set());
    router.refresh();
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Generar liquidación</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
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

            {idPropietario && (
              <div className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Conceptos pendientes de liquidar</p>
                    <p className="text-xs text-muted-foreground">
                      Elegí exactamente cuáles querés incluir en esta liquidación.
                    </p>
                  </div>
                  {pendientes.length > 0 && (
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={seleccionarTodos}>
                        Seleccionar todos
                      </Button>
                      {seleccionados.size > 0 && (
                        <Button type="button" variant="ghost" size="sm" onClick={limpiarSeleccion}>
                          Limpiar
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {loadingPendientes ? (
                  <p className="py-4 text-sm text-muted-foreground">Buscando pendientes...</p>
                ) : pendientes.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">
                    No hay conceptos pendientes hasta la fecha seleccionada.
                  </p>
                ) : (
                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {pendientes.map((concepto) => {
                      const key = claveConcepto(concepto);
                      const checked = seleccionados.has(key);
                      return (
                        <label
                          key={key}
                          className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/40"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleConcepto(concepto)}
                            className="mt-1"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium">
                                  {concepto.tipo === "ALQUILER"
                                    ? `Alquiler ${concepto.periodo ?? ""}`
                                    : concepto.concepto}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {concepto.propiedad.direccion} · {concepto.porcentaje_participacion}%
                                </p>
                              </div>
                              <p className="shrink-0 font-mono text-sm font-semibold">
                                {concepto.tipo === "GASTO" ? "−" : ""}
                                {formatMonto(concepto.monto)}
                              </p>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Movimiento del {new Date(concepto.fecha).toLocaleDateString("es-AR")}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

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

            <Button
              className="w-full"
              disabled={!idPropietario || loading || loadingPendientes}
              onClick={generar}
            >
              {loading ? "Generando..." : "Generar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
