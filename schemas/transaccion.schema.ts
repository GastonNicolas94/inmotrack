import { z } from "zod";

export const contraAsientoSchema = z.object({
  id_txn_origen: z.number().int().positive(),
  comentario: z.string().min(1, "El comentario es obligatorio."),
});

export type ContraAsientoInput = z.infer<typeof contraAsientoSchema>;
