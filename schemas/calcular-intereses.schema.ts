import { z } from "zod";

export const calcularInteresesSchema = z.object({
  ids_cargo: z.array(z.number().int().positive()).min(1, "Seleccioná al menos un cargo."),
});

export type CalcularInteresesInput = z.infer<typeof calcularInteresesSchema>;
