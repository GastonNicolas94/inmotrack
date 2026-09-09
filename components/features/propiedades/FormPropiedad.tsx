"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { propiedadSchema, type PropiedadInput } from "@/schemas/propiedad.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface Propietario {
  id: number;
  nombre: string;
}

interface Props {
  propietarios: Propietario[];
  onSuccess?: () => void;
}

export function FormPropiedad({ propietarios, onSuccess }: Props) {
  const router = useRouter();
  const form = useForm<PropiedadInput>({
    resolver: zodResolver(propiedadSchema),
    defaultValues: { direccion: "", es_propia: false },
  });

  async function onSubmit(values: PropiedadInput) {
    const res = await fetch("/api/v1/propiedades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!res.ok) {
      const err = await res.json();
      toast.error(err.message ?? "Error al guardar.");
      return;
    }

    toast.success("Propiedad creada.");
    router.refresh();
    onSuccess?.();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="id_propietario"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Propietario</FormLabel>
              <Select onValueChange={(v) => field.onChange(Number(v))}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccioná un propietario" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {propietarios.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.nombre}
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
          name="direccion"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Dirección</FormLabel>
              <FormControl>
                <Input placeholder="Ej: Av. Corrientes 1234, CABA" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="es_propia"
          render={({ field }) => (
            <FormItem className="flex items-center gap-3">
              <FormControl>
                <input
                  type="checkbox"
                  checked={field.value}
                  onChange={field.onChange}
                  className="size-4 rounded-sm border-input accent-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </FormControl>
              <FormLabel className="!mt-0">Propiedad propia de la inmobiliaria</FormLabel>
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Guardando..." : "Crear propiedad"}
        </Button>
      </form>
    </Form>
  );
}
