import { z } from "zod";

export const propietarioSchema = z.object({
  nombre: z.string().min(2, "El nombre debe tener al menos 2 caracteres."),
  cbu: z
    .string()
    .length(22, "El CBU debe tener exactamente 22 dígitos.")
    .regex(/^\d{22}$/, "El CBU solo puede contener dígitos."),
});

export type PropietarioInput = z.infer<typeof propietarioSchema>;
