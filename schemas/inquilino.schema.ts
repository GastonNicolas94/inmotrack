import { z } from "zod";

export const inquilinoSchema = z.object({
  nombre: z.string().min(2, "El nombre debe tener al menos 2 caracteres."),
  dni_cuit: z
    .string()
    .regex(/^\d{7,11}$/, "DNI (7-8 dígitos) o CUIT (11 dígitos) sin guiones."),
  email: z.string().email("Email inválido.").optional().or(z.literal("")),
  telefono: z.string().optional(),
});

export type InquilinoInput = z.infer<typeof inquilinoSchema>;
