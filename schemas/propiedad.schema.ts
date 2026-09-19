import { z } from "zod";

export const participacionPropietarioSchema = z.object({
  id_propietario: z.number().int().positive("Seleccioná un propietario."),
  porcentaje: z.number().positive("El porcentaje debe ser mayor a 0.").max(100),
});

export const propiedadSchema = z
  .object({
    direccion: z.string().min(5, "La dirección debe tener al menos 5 caracteres."),
    es_propia: z.boolean(),
    participaciones: z
      .array(participacionPropietarioSchema)
      .min(1, "La propiedad debe tener al menos un propietario."),
  })
  .superRefine((data, ctx) => {
    const ids = new Set<number>();
    for (const participacion of data.participaciones) {
      if (ids.has(participacion.id_propietario)) {
        ctx.addIssue({
          code: "custom",
          path: ["participaciones"],
          message: "Un propietario no puede repetirse.",
        });
        break;
      }
      ids.add(participacion.id_propietario);
    }

    const total = data.participaciones.reduce(
      (acumulado, participacion) => acumulado + participacion.porcentaje,
      0,
    );
    if (Math.abs(total - 100) > 0.000001) {
      ctx.addIssue({
        code: "custom",
        path: ["participaciones"],
        message: "Los porcentajes deben sumar exactamente 100%.",
      });
    }
  });

export type PropiedadInput = z.infer<typeof propiedadSchema>;
