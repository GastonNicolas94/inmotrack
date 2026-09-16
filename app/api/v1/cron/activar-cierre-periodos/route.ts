import { NextRequest, NextResponse, after } from "next/server";
import { validarCronSecret } from "@/lib/cron-auth";
import { CierrePeriodosService } from "@/services/cierre-periodos.service";
import { ContratosService } from "@/services/contratos.service";
import { errorResponse } from "@/lib/errors";
import { withObservability } from "@/lib/observability/with-observability";

async function getActivarCierrePeriodos(req: NextRequest) {
  if (!validarCronSecret(req)) {
    return errorResponse("UNAUTHORIZED", "Secret inválido.", 401);
  }

  const { encolados, vencidos } = await CierrePeriodosService.encolarContratosVencidos();
  const { marcados: por_vencer } = await ContratosService.marcarContratosPorVencer();

  after(async () => {
    const secret = process.env.CRON_SECRET;
    const url = new URL("/api/v1/cron/procesar-cola-cierre", req.url);
    await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    }).catch(() => {});
  });

  return NextResponse.json({ encolados, vencidos, por_vencer });
}

export const GET = withObservability(getActivarCierrePeriodos);
