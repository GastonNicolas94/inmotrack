import { z } from "zod";

export const gastoSchema = z
  .object({
    id_propiedad: z.number().int().positive().optional(),
    id_contrato: z.number().int().positive().optional(),
    concepto: z.string().min(1, "El concepto es requerido."),
    categoria_interno: z.string().optional(),
    monto: z.number().positive("El monto debe ser mayor a 0."),
    tipo: z.enum(["ARREGLO", "EXPENSA", "GAS", "LUZ", "IMPUESTO", "OTRO"]),
    cargo_a: z.enum(["INQUILINO", "PROPIETARIO", "INMOBILIARIA"]),
    fecha_gasto: z.string().min(1),
  })
  .refine((d) => d.id_propiedad !== undefined || d.cargo_a === "INMOBILIARIA", {
    message: "Un gasto sin propiedad debe ser cargo_a INMOBILIARIA.",
    path: ["cargo_a"],
  });

export type GastoInput = z.infer<typeof gastoSchema>;
