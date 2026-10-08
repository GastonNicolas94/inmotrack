import "server-only";

import { prisma } from "@/lib/db";
import { traceServiceObject } from "@/lib/observability/tracing";

/** Conteo liviano de períodos con deuda, consistente con la vista de cobranza. */
export const MenuPendientesService = traceServiceObject("MenuPendientesService", {
  async contar() {
    const result = await prisma.$queryRaw<Array<{ cantidad: number }>>`
      WITH aplicaciones AS (
        SELECT id_cargo, SUM(monto_aplicado) AS monto
        FROM aplicaciones_pago GROUP BY id_cargo
      ),
      saldos AS (
        SELECT c.id_periodo, SUM(c.monto - COALESCE(a.monto, 0)) AS pendiente
        FROM cargos c LEFT JOIN aplicaciones a ON a.id_cargo = c.id
        GROUP BY c.id_periodo
      )
      SELECT COUNT(*)::integer AS cantidad FROM saldos WHERE pendiente > 0
    `;
    return result[0]?.cantidad ?? 0;
  },
});
