import "server-only";

import { separarSaldosContables } from "@/lib/dashboard/cajas";
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
    return separarSaldosContables(sums);
  },
});
