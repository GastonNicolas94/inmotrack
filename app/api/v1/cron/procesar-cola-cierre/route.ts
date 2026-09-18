import { NextRequest, NextResponse } from "next/server";
import { validarCronSecret } from "@/lib/cron-auth";
import { CierrePeriodosService } from "@/services/cierre-periodos.service";
import { errorResponse } from "@/lib/errors";
import { withObservability } from "@/lib/observability/with-observability";

async function postProcesarColaCierre(req: NextRequest) {
  if (!validarCronSecret(req)) {
    return errorResponse("UNAUTHORIZED", "Secret inválido.", 401);
  }

  const { huboTrabajo } = await CierrePeriodosService.procesarUnaFilaDeCola();
  return NextResponse.json({ huboTrabajo });
}

export const POST = withObservability(postProcesarColaCierre);
