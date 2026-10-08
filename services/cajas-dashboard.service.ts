import "server-only";

import { Decimal } from "@prisma/client/runtime/client";
import { prisma } from "@/lib/db";
import { traceServiceObject } from "@/lib/observability/tracing";

/**
 * Saldo contable acumulado, separado por caja. Nunca mezclar como total general.
 * No implica conciliación bancaria ni disponibilidad real de fondos.
 */
export const CajasDashboardService = traceServiceObject("CajasDashboardService", {
  async obtenerSaldos() {
    const sums = await prisma.transaccion.groupBy({
      by: ["caja_destino"],
      _sum: { monto: true },
    });
    const amount = (caja: "TERCEROS" | "OPERATIVA") =>
      new Decimal(sums.find((row) => row.caja_destino === caja)?._sum.monto ?? 0).toFixed(2);
    return { terceros: amount("TERCEROS"), operativa: amount("OPERATIVA") };
  },
});
