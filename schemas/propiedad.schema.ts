import { z } from "zod";

export const propiedadSchema = z.object({
  id_propietario: z.number().int().positive("Seleccioná un propietario."),
  direccion: z.string().min(5, "La dirección debe tener al menos 5 caracteres."),
  es_propia: z.boolean(),
});

export type PropiedadInput = z.infer<typeof propiedadSchema>;
