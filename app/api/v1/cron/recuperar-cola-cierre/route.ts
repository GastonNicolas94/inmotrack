import { NextRequest, NextResponse } from "next/server";
import { validarCronSecret } from "@/lib/cron-auth";
import { AppClock } from "@/lib/app-clock";
import { errorResponse } from "@/lib/errors";
import { CierrePeriodosService } from "@/services/cierre-periodos.service";
import { CierrePeriodosQueueService } from "@/services/cierre-periodos-queue.service";
import { withObservability } from "@/lib/observability/with-observability";
import { logger } from "@/lib/observability/logger";

const ANTIGUEDAD_MINIMA_MS = 60_000;

async function getRecuperarColaCierre(req: NextRequest) {
  if (!validarCronSecret(req)) {
    return errorResponse("UNAUTHORIZED", "Secret inválido.", 401);
  }

  const ahora = await AppClock.now();
  const antesDe = new Date(ahora.getTime() - ANTIGUEDAD_MINIMA_MS);
  const pendientes = await CierrePeriodosService.listarPendientesParaRecuperar(antesDe);

  const publicaciones = await Promise.allSettled(
    pendientes.map(({ id }) => CierrePeriodosQueueService.publicar(id)),
  );
  const fallidas = publicaciones.filter((resultado) => resultado.status === "rejected").length;

  if (fallidas > 0) {
    logger.error("queue.republish.failed", {
      pendientes: pendientes.length,
      fallidas,
    });
  }

  return NextResponse.json({
    pendientes: pendientes.length,
    publicadas: pendientes.length - fallidas,
    fallidas,
  });
}

export const GET = withObservability(getRecuperarColaCierre);
