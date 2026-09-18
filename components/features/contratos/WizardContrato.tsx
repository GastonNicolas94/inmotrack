"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { contratoSchema, type ContratoInput } from "@/schemas/contrato.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

interface Propiedad { id: number; direccion: string; propietario: { nombre: string } }
interface Inquilino { id: number; nombre: string }

export function WizardContrato({
  propiedades,
  inquilinos,
}: {
  propiedades: Propiedad[];
  inquilinos: Inquilino[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const form = useForm<ContratoInput>({
    resolver: zodResolver(contratoSchema),
    defaultValues: {
      pct_comision: 5,
      pct_punitorio_diario: 0.1,
      cobra_confeccion: false,
    },
  });

  async function onSubmit(values: ContratoInput) {
    const res = await fetch("/api/v1/contratos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!res.ok) {
      const err = await res.json();
      toast.error(err.message ?? "Error al crear el contrato.");
      return;
    }

    toast.success("Contrato creado en estado BORRADOR. Activalo para generar el primer período.");
    setOpen(false);
    form.reset();
    router.refresh();
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Nuevo contrato</Button>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) form.reset(); }}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo contrato</DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="id_propiedad"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Propiedad</FormLabel>
                      <Select
                        value={field.value != null ? String(field.value) : undefined}
                        onValueChange={(v) => field.onChange(Number(v))}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Seleccioná una propiedad">
                              {(value: string | null) => {
                                const p = propiedades.find((p) => String(p.id) === value);
                                return p ? `${p.direccion} — ${p.propietario.nombre}` : null;
                              }}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="w-max max-w-sm">
                          {propiedades.map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              {p.direccion} — {p.propietario.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="id_inquilino"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Inquilino</FormLabel>
                      <Select
                        value={field.value != null ? String(field.value) : undefined}
                        onValueChange={(v) => field.onChange(Number(v))}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Seleccioná un inquilino">
                              {(value: string | null) => {
                                const i = inquilinos.find((i) => String(i.id) === value);
                                return i ? i.nombre : null;
                              }}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {inquilinos.map((i) => (
                            <SelectItem key={i.id} value={String(i.id)}>
                              {i.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="fecha_inicio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Inicio</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="fecha_fin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fin</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="monto_base"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Alquiler mensual ($)</FormLabel>
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

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="pct_comision"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Comisión (%)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
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
                <FormField
                  control={form.control}
                  name="pct_punitorio_diario"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Punitorio diario (%)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={1}
                          step={0.001}
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
              </div>

              <FormField
                control={form.control}
                name="indice_act"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Índice de actualización — opcional</FormLabel>
                    <Select value={field.value ?? undefined} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Sin ajuste automático">
                            {(value: string | null) => {
                              const etiquetas: Record<string, string> = {
                                ICL: "ICL (BCRA)",
                                IPC: "IPC (INDEC)",
                                ACUERDO: "Acuerdo de partes",
                              };
                              return value ? etiquetas[value] ?? value : null;
                            }}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ICL">ICL (BCRA)</SelectItem>
                        <SelectItem value="IPC">IPC (INDEC)</SelectItem>
                        <SelectItem value="ACUERDO">Acuerdo de partes</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.watch("indice_act") && (
                <FormField
                  control={form.control}
                  name="meses_act"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Frecuencia de actualización</FormLabel>
                      <Select
                        value={field.value != null ? String(field.value) : undefined}
                        onValueChange={(value) => field.onChange(Number(value))}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Cada cuántos meses">
                              {(value: string | null) => value ? `Cada ${value} meses` : null}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="3">Cada 3 meses</SelectItem>
                          <SelectItem value="4">Cada 4 meses</SelectItem>
                          <SelectItem value="6">Cada 6 meses</SelectItem>
                          <SelectItem value="12">Cada 12 meses</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="cobra_confeccion"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-2.5">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(checked) => field.onChange(checked === true)}
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">¿Cobrar confección de contrato?</FormLabel>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.watch("cobra_confeccion") && (
                <FormField
                  control={form.control}
                  name="estrategia_confeccion"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estrategia de cálculo</FormLabel>
                      <Select value={field.value ?? undefined} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Elegí una estrategia">
                              {(value: string | null) => {
                                const etiquetas: Record<string, string> = {
                                  UN_ALQUILER: "El valor de un alquiler",
                                  PORCENTAJE_5: "5% del contrato total",
                                };
                                return value ? etiquetas[value] ?? value : null;
                              }}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="UN_ALQUILER">El valor de un alquiler</SelectItem>
                          <SelectItem value="PORCENTAJE_5">5% del contrato total</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Creando..." : "Crear contrato"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
