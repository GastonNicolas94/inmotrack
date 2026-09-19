"use client";

import { useFieldArray, useForm } from "react-hook-form";
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

interface PropiedadEditable {
  id: number;
  direccion: string;
  es_propia: boolean;
  participaciones: Array<{
    id_propietario: number;
    porcentaje: number;
  }>;
}

interface Props {
  propietarios: Propietario[];
  propiedad?: PropiedadEditable;
  onSuccess?: () => void;
}

export function FormPropiedad({ propietarios, propiedad, onSuccess }: Props) {
  const router = useRouter();
  const form = useForm<PropiedadInput>({
    resolver: zodResolver(propiedadSchema),
    defaultValues: propiedad
      ? {
          direccion: propiedad.direccion,
          es_propia: propiedad.es_propia,
          participaciones: propiedad.participaciones,
        }
      : {
          direccion: "",
          es_propia: false,
          participaciones: [{ id_propietario: 0, porcentaje: 100 }],
        },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "participaciones",
  });

  const participaciones = form.watch("participaciones");
  const total = participaciones.reduce(
    (acumulado, participacion) => acumulado + (Number(participacion.porcentaje) || 0),
    0,
  );

  async function onSubmit(values: PropiedadInput) {
    const res = await fetch(
      propiedad ? `/api/v1/propiedades/${propiedad.id}` : "/api/v1/propiedades",
      {
        method: propiedad ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      },
    );

    if (!res.ok) {
      const err = await res.json();
      toast.error(err.message ?? "Error al guardar.");
      return;
    }

    toast.success(propiedad ? "Propiedad actualizada." : "Propiedad creada.");
    router.refresh();
    onSuccess?.();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <FormLabel>Propietarios</FormLabel>
            <span className={total === 100 ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
              Total: {total.toFixed(2)}%
            </span>
          </div>

          {fields.map((participacion, index) => (
            <div key={participacion.id} className="grid grid-cols-[1fr_120px_auto] gap-2 items-start">
              <FormField
                control={form.control}
                name={`participaciones.${index}.id_propietario`}
                render={({ field }) => (
                  <FormItem>
                    <Select
                      value={field.value > 0 ? String(field.value) : undefined}
                      onValueChange={(value) => field.onChange(Number(value))}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Propietario" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {propietarios.map((item) => (
                          <SelectItem key={item.id} value={String(item.id)}>
                            {item.nombre}
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
                name={`participaciones.${index}.porcentaje`}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        type="number"
                        min="0.01"
                        max="100"
                        step="0.01"
                        aria-label="Porcentaje de participación"
                        value={field.value}
                        onChange={(event) => field.onChange(Number(event.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={fields.length === 1}
                onClick={() => remove(index)}
                aria-label="Quitar propietario"
              >
                Quitar
              </Button>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ id_propietario: 0, porcentaje: 0 })}
          >
            + Agregar propietario
          </Button>

          {form.formState.errors.participaciones?.root?.message ? (
            <p className="text-sm text-destructive">
              {form.formState.errors.participaciones.root.message}
            </p>
          ) : null}
          {typeof form.formState.errors.participaciones?.message === "string" ? (
            <p className="text-sm text-destructive">
              {form.formState.errors.participaciones.message}
            </p>
          ) : null}
        </div>

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

        <Button type="submit" disabled={form.formState.isSubmitting || total !== 100}>
          {form.formState.isSubmitting
            ? "Guardando..."
            : propiedad
              ? "Guardar cambios"
              : "Crear propiedad"}
        </Button>
      </form>
    </Form>
  );
}
