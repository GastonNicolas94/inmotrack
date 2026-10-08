"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Decimal } from "@prisma/client/runtime/client";
import { pagoSchema, type PagoInput } from "@/schemas/pago.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { fmt } from "@/components/features/shared/PeriodoResumenRow";
import { EstadoAsyncModal } from "@/components/features/shared/EstadoAsyncModal";
import { simularPrelacion } from "@/lib/prelacion";
import { etiquetaTipoCargo, type TipoCargoCodigo } from "@/lib/cargos";

interface Props {
  contrato: {
    id: number;
    inquilino: { nombre: string };
    propiedad: { direccion: string };
  };
  triggerClassName?: string;
}

interface CargoPendiente {
  id: number;
  tipo: TipoCargoCodigo;
  periodo: string;
  monto: number | string;
  pendiente: number | string;
}


function nuevoIdempotencyKey() {
  return crypto.randomUUID();
}

export function ModalRegistrarPago({ contrato, triggerClassName }: Props) {
  const [open, setOpen] = useState(false);
  const [cargos, setCargos] = useState<CargoPendiente[]>([]);
  const [saldoAFavor, setSaldoAFavor] = useState<string>("0");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const form = useForm<PagoInput>({
    resolver: zodResolver(pagoSchema),
    defaultValues: {
      id_contrato: contrato.id,
      monto_pagado: 0,
      idempotency_key: nuevoIdempotencyKey(),
    },
  });

  const montoIngresado = useWatch({ control: form.control, name: "monto_pagado" }) ?? 0;

  useEffect(() => {
    if (!open) return;
    fetch(`/api/v1/contratos/${contrato.id}/cargos-pendientes`)
      .then((r) => r.json())
      .then((data: { cargos: CargoPendiente[]; saldo_a_favor: string }) => {
        setCargos(data.cargos);
        setSaldoAFavor(data.saldo_a_favor);
      })
      .finally(() => setLoading(false));
  }, [open, contrato.id]);

  // Vista previa en vivo: misma prelación que PagosService.registrar,
  // pero sin tocar la base — solo para mostrar qué se cubriría.
  const cobertura = useMemo(() => {
    if (!montoIngresado || montoIngresado <= 0) return new Map<number, Decimal>();
    const aplicaciones = simularPrelacion(
      cargos.map((c) => ({ id: c.id, tipo: c.tipo, pendiente: c.pendiente })),
      montoIngresado
    );
    return new Map(aplicaciones.map((a) => [a.id_cargo, a.monto_aplicado]));
  }, [cargos, montoIngresado]);

  const deudaPendiente = useMemo(
    () => cargos.reduce((acc, cargo) => acc.plus(cargo.pendiente), new Decimal(0)),
    [cargos],
  );

  const totalCubierto = useMemo(
    () => Array.from(cobertura.values()).reduce((acc, m) => acc.plus(m), new Decimal(0)),
    [cobertura]
  );
  const sobrante =
    montoIngresado > 0 ? new Decimal(montoIngresado).minus(totalCubierto) : new Decimal(0);

  async function onSubmit(values: PagoInput) {
    const res = await fetch("/api/v1/pagos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!res.ok) {
      const err = await res.json();
      toast.error(err.message ?? "Error al registrar el pago.");
      return;
    }

    toast.success("Pago registrado.");
    setOpen(false);
    form.reset({
      id_contrato: contrato.id,
      monto_pagado: 0,
      idempotency_key: nuevoIdempotencyKey(),
    });
    router.refresh();
  }

  return (
    <>
      <Button size="sm" variant="outline" className={triggerClassName} onClick={() => { setLoading(true); setOpen(true); }}>
        Registrar pago
      </Button>
      <Dialog open={open} onOpenChange={(next) => { if (next) setLoading(true); setOpen(next); }}>
        <DialogContent className="w-[calc(100vw-32px)] max-h-[min(85dvh,720px)] overflow-y-auto sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Registrar pago</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {contrato.propiedad.direccion} — {contrato.inquilino.nombre}
            </p>
          </DialogHeader>

          {loading ? (
            <EstadoAsyncModal mensaje="Cargando deuda..." />
          ) : (
            <div className="space-y-5">
              <div className="rounded-lg bg-brand-soft p-4">
                <p className="text-[10px] font-bold uppercase tracking-[1px] text-muted-foreground">Deuda pendiente del contrato</p>
                <p className="inmotrack-amount mt-2 text-[26px] font-bold text-foreground">{fmt(deudaPendiente.toString())}</p>
                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border/70 pt-3 text-[11px]">
                  <p className="text-muted-foreground">Cargos sin cubrir<br /><strong className="font-heading text-[13px] text-foreground">{cargos.length}</strong></p>
                  <p className="text-muted-foreground">Saldo a favor<br /><strong className="inmotrack-amount text-[13px] text-foreground">{fmt(saldoAFavor)}</strong></p>
                </div>
              </div>
              {Number(saldoAFavor) > 0 && (
                <div className="rounded-lg border border-border bg-status-success-bg px-3 py-2 text-sm text-status-success">
                  Este inquilino tiene <span className="font-heading tabular-nums font-semibold">{fmt(saldoAFavor)}</span>{" "}
                  de saldo a favor disponible — se aplica solo, contra la próxima deuda que aparezca o al
                  cerrar el período.
                </div>
              )}

              {cargos.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-2">Sin deuda pendiente.</p>
              ) : (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Deuda pendiente</h3>
                  {cargos.map((c) => {
                    const cubierto = cobertura.get(c.id);
                    return (
                      <div key={c.id} className="rounded-lg border border-border px-3 py-2 text-sm">
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="font-heading tabular-nums font-medium">{c.periodo}</span>
                            <span className="text-xs text-muted-foreground">
                              {etiquetaTipoCargo(c.tipo)}
                            </span>
                          </div>
                          <div className="inmotrack-amount text-right text-[12px] font-semibold text-foreground">
                            Debe: <span className="font-heading tabular-nums">{fmt(c.pendiente)}</span>
                          </div>
                        </div>
                        {cubierto && cubierto.greaterThan(0) && (
                          <div className="mt-1 text-right text-[11px] font-semibold text-foreground">
                            Se cubre con este pago: {fmt(cubierto.toString())}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {montoIngresado > 0 ? <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted p-3 text-[11px]">
                <div><p className="text-muted-foreground">Se aplica al saldo</p><p className="inmotrack-amount mt-1 text-[15px] font-bold">{fmt(totalCubierto.toString())}</p></div>
                <div><p className="text-muted-foreground">Sobrante</p><p className="inmotrack-amount mt-1 text-[15px] font-bold">{fmt(sobrante.toString())}</p></div>
              </div> : null}

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="monto_pagado"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Monto pagado ($)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            placeholder="0.00"
                            {...field}
                            value={field.value || ""}
                            onChange={(e) => {
                              const parsed = parseFloat(e.target.value);
                              field.onChange(Number.isNaN(parsed) ? 0 : parsed);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {montoIngresado > 0 && sobrante.greaterThan(0) && (
                    <p className="text-xs text-muted-foreground">
                      Sobrante sin aplicar (queda disponible para lo próximo):{" "}
                      <span className="font-heading tabular-nums font-medium text-foreground">
                        {fmt(sobrante.toString())}
                      </span>
                    </p>
                  )}
                  <Button type="submit" className="h-[46px] w-full" disabled={form.formState.isSubmitting || loading}>
                    {form.formState.isSubmitting ? "Registrando..." : "Confirmar pago"}
                  </Button>
                </form>
              </Form>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
