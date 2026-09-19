import { z } from "zod";

export const generarLiquidacionSchema = z.object({
  id_propietario: z.number().int().positive(),
  hasta: z.coerce.date(),
  descontar_adelantos: z.coerce.number().min(0).default(0),
  conceptos: z.array(z.object({
    tipo: z.enum(["ALQUILER", "GASTO"]),
    id: z.number().int().positive(),
  })).optional(),
});

export type LiquidacionResumen = {
  id: number;
  id_propietario: number;
  monto_bruto: string;
  retenciones: string;
  monto_neto: string;
  estado: "PENDIENTE" | "APROBADA" | "PAGADA";
};
