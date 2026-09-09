import { z } from "zod";

export const pagoSchema = z.object({
  id_contrato: z.number().int().positive(),
  monto_pagado: z.number().positive(),
  idempotency_key: z.string().uuid(),
});

export type PagoInput = z.infer<typeof pagoSchema>;
