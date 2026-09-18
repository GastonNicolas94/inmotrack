import { z } from "zod";

export const aplicarAjusteContratoSchema = z.object({
  monto_nuevo: z.number().positive("El nuevo monto debe ser mayor a 0."),
  observacion: z.string().trim().max(500, "La observación no puede superar 500 caracteres.").optional(),
});

export type AplicarAjusteContratoInput = z.infer<typeof aplicarAjusteContratoSchema>;
