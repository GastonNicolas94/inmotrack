import { Decimal } from "@prisma/client/runtime/client";

type Caja = "TERCEROS" | "OPERATIVA";
type Row = { caja_destino: Caja; _sum: { monto: Decimal | string | number | null } };

/**
 * Convierte saldos agregados del Libro Diario a montos decimales exactos.
 * La separación es imprescindible: no devuelve un total general.
 */
export function separarSaldosContables(rows: readonly Row[]) {
  const saldo = (caja: Caja) => {
    const value = rows.find((row) => row.caja_destino === caja)?._sum.monto;
    return new Decimal(value ?? 0).toFixed(2);
  };
  return { terceros: saldo("TERCEROS"), operativa: saldo("OPERATIVA") };
}
