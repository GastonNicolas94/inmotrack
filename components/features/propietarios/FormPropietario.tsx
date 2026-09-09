"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { propietarioSchema, type PropietarioInput } from "@/schemas/propietario.schema";
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
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface Props {
  defaultValues?: Partial<PropietarioInput>;
  propietarioId?: number;
  onSuccess?: () => void;
}

export function FormPropietario({ defaultValues, propietarioId, onSuccess }: Props) {
  const router = useRouter();
  const form = useForm<PropietarioInput>({
    resolver: zodResolver(propietarioSchema),
    defaultValues: defaultValues ?? { nombre: "", cbu: "" },
  });

  async function onSubmit(values: PropietarioInput) {
    const url = propietarioId
      ? `/api/v1/propietarios/${propietarioId}`
      : "/api/v1/propietarios";
    const method = propietarioId ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!res.ok) {
      const err = await res.json();
      toast.error(err.message ?? "Error al guardar.");
      return;
    }

    toast.success(propietarioId ? "Propietario actualizado." : "Propietario creado.");
    router.refresh();
    onSuccess?.();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="nombre"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre completo</FormLabel>
              <FormControl>
                <Input placeholder="Ej: Juan Pérez" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="cbu"
          render={({ field }) => (
            <FormItem>
              <FormLabel>CBU (22 dígitos)</FormLabel>
              <FormControl>
                <Input
                  placeholder="0000000000000000000000"
                  maxLength={22}
                  inputMode="numeric"
                  {...field}
                  onChange={(e) => {
                    // Solo dígitos
                    field.onChange(e.target.value.replace(/\D/g, ""));
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting
            ? "Guardando..."
            : propietarioId
            ? "Actualizar"
            : "Crear propietario"}
        </Button>
      </form>
    </Form>
  );
}
