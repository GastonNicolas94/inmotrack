"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { inquilinoSchema, type InquilinoInput } from "@/schemas/inquilino.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function FormInquilino({ onSuccess }: { onSuccess?: () => void }) {
  const router = useRouter();
  const form = useForm<InquilinoInput>({
    resolver: zodResolver(inquilinoSchema),
    defaultValues: { nombre: "", dni_cuit: "", email: "", telefono: "" },
  });

  async function onSubmit(values: InquilinoInput) {
    const res = await fetch("/api/v1/inquilinos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!res.ok) {
      const err = await res.json();
      toast.error(err.message ?? "Error al guardar.");
      return;
    }

    toast.success("Inquilino creado.");
    router.refresh();
    onSuccess?.();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField control={form.control} name="nombre" render={({ field }) => (
          <FormItem>
            <FormLabel>Nombre completo</FormLabel>
            <FormControl><Input placeholder="Ej: María García" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="dni_cuit" render={({ field }) => (
          <FormItem>
            <FormLabel>DNI / CUIT</FormLabel>
            <FormControl>
              <Input
                placeholder="Sin puntos ni guiones"
                inputMode="numeric"
                {...field}
                onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ""))}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="email" render={({ field }) => (
            <FormItem>
              <FormLabel>Email — opcional</FormLabel>
              <FormControl><Input type="email" placeholder="mail@ejemplo.com" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="telefono" render={({ field }) => (
            <FormItem>
              <FormLabel>Teléfono — opcional</FormLabel>
              <FormControl><Input placeholder="1123456789" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Guardando..." : "Crear inquilino"}
        </Button>
      </form>
    </Form>
  );
}
