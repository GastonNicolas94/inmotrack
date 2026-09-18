import { NextRequest, NextResponse } from "next/server";
import { validarCronSecret } from "@/lib/cron-auth";
import { CierrePeriodosService } from "@/services/cierre-periodos.service";
import { CierrePeriodosQueueService } from "@/services/cierre-periodos-queue.service";
import { ContratosService } from "@/services/contratos.service";
import { errorResponse } from "@/lib/errors";
import { withObservability } from "@/lib/observability/with-observability";
import { logger } from "@/lib/observability/logger";

async function getActivarCierrePeriodos(req: NextRequest) {
  if (!validarCronSecret(req)) {
    return errorResponse("UNAUTHORIZED", "Secret inválido.", 401);
  }

  const { encolados, vencidos, outboxIds } = await CierrePeriodosService.encolarContratosVencidos();
  const { marcados: por_vencer } = await ContratosService.marcarContratosPorVencer();

  const publicaciones = await Promise.allSettled(
    outboxIds.map((outboxId) => CierrePeriodosQueueService.publicar(outboxId)),
  );
  const publicaciones_fallidas = publicaciones.filter((resultado) => resultado.status === "rejected").length;

  if (publicaciones_fallidas > 0) {
    logger.error("queue.publish.failed", {
      total: outboxIds.length,
      publicaciones_fallidas,
    });
  }

  return NextResponse.json({
    encolados,
    vencidos,
    por_vencer,
    publicaciones: outboxIds.length - publicaciones_fallidas,
    publicaciones_fallidas,
  });
}

export const GET = withObservability(getActivarCierrePeriodos);
