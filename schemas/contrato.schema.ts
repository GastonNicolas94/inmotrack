import { z } from "zod";

export const contratoSchema = z
  .object({
    id_propiedad: z.number().int().positive("Seleccioná una propiedad."),
    id_inquilino: z.number().int().positive("Seleccioná un inquilino."),
    fecha_inicio: z.string().min(1, "La fecha de inicio es requerida."),
    fecha_fin: z.string().min(1, "La fecha de fin es requerida."),
    monto_base: z.number().positive("El monto debe ser mayor a 0."),
    pct_comision: z
      .number()
      .min(0, "Mínimo 0%.")
      .max(100, "Máximo 100%."),
    pct_punitorio_diario: z
      .number()
      .min(0)
      .max(1, "Máximo 1% diario."),
    indice_act: z.enum(["ICL", "IPC", "ACUERDO"]).optional(),
    meses_act: z.number().int().positive().optional(),
    cobra_confeccion: z.boolean().optional(),
    estrategia_confeccion: z.enum(["UN_ALQUILER", "PORCENTAJE_5"]).optional(),
  })
  .refine((d) => new Date(d.fecha_fin) > new Date(d.fecha_inicio), {
    message: "La fecha de fin debe ser posterior a la de inicio.",
    path: ["fecha_fin"],
  })
  .refine((d) => !d.indice_act || d.meses_act != null, {
    message: "Indicá cada cuántos meses se actualiza el contrato.",
    path: ["meses_act"],
  })
  .refine((d) => !d.cobra_confeccion || d.estrategia_confeccion, {
    message: "Elegí una estrategia de cálculo para la confección de contrato.",
    path: ["estrategia_confeccion"],
  });

export type ContratoInput = z.infer<typeof contratoSchema>;
