import { z } from "zod";

export const registrarAdelantoSchema = z.object({
  monto: z.number().positive(),
});
