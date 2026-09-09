"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { gastoSchema, type GastoInput } from "@/schemas/gasto.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

interface Props {
  id_propiedad?: number;
  id_contrato?: number;
  label?: string;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "ghost";
  triggerSize?: "default" | "sm";
}

export function ModalCargarGasto({ id_propiedad, id_contrato, label, triggerLabel = "Cargar gasto", triggerVariant = "default", triggerSize = "default" }: Props) {
  const [open, setOpen] = useState(false);
  const [esPropio, setEsPropio] = useState(false);
  const router = useRouter();
  const contextoFijo = id_propiedad !== undefined;

  const form = useForm<GastoInput>({
    resolver: zodResolver(gastoSchema),
    defaultValues: {
      id_propiedad,
      id_contrato,
      concepto: "",
      monto: 0,
      tipo: "ARREGLO",
      cargo_a: "PROPIETARIO",
      fecha_gasto: new Date().toISOString().slice(0, 10),
    },
  });

  function elegirDePropiedad() {
    setEsPropio(false);
    form.setValue("cargo_a", "PROPIETARIO");
  }

  function elegirPropio() {
    setEsPropio(true);
    form.setValue("cargo_a", "INMOBILIARIA");
    form.setValue("id_propiedad", undefined);
    form.setValue("id_contrato", undefined);
  }

  async function onSubmit(values: GastoInput) {
    const res = await fetch("/api/v1/gastos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!res.ok) {
      const err = await res.json();
      toast.error(err.message ?? "Error al cargar el gasto.");
      return;
    }

    toast.success("Gasto cargado.");
    setOpen(false);
    form.reset();
    setEsPropio(false);
    router.refresh();
  }

  return (
    <>
      <Button size={triggerSize} variant={triggerVariant} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cargar gasto</DialogTitle>
            {label && <p className="text-sm text-muted-foreground">{label}</p>}
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {!contextoFijo && (
                <div className="space-y-1.5">
                  <Label>Tipo de gasto</Label>
                  <Select
                    value={esPropio ? "propio" : "propiedad"}
                    onValueChange={(v) => (v === "propio" ? elegirPropio() : elegirDePropiedad())}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="propiedad">De una propiedad</SelectItem>
                      <SelectItem value="propio">Propio de la inmobiliaria</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <FormField
                control={form.control}
                name="concepto"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Concepto</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {esPropio && !contextoFijo && (
                <FormField
                  control={form.control}
                  name="categoria_interno"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Categoría (ej. Sueldos, Alquiler oficina)</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="monto"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number" min={0} step={0.01} placeholder="0.00"
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
                name="tipo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ARREGLO">Arreglo</SelectItem>
                        <SelectItem value="EXPENSA">Expensas</SelectItem>
                        <SelectItem value="GAS">Gas</SelectItem>
                        <SelectItem value="LUZ">Luz</SelectItem>
                        <SelectItem value="IMPUESTO">Impuesto</SelectItem>
                        <SelectItem value="OTRO">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!esPropio && (
                <FormField
                  control={form.control}
                  name="cargo_a"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cargo a</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="PROPIETARIO">Propietario</SelectItem>
                          <SelectItem value="INQUILINO">Inquilino</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="fecha_gasto"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Guardando..." : "Cargar gasto"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
