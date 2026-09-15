import { NextResponse, after } from "next/server";
import { validarCronSecret } from "@/lib/cron-auth";
import { CierrePeriodosClockService } from "@/services/cierre-periodos-clock.service";
import { ContratosClockService } from "@/services/contratos-clock.service";
import { errorResponse } from "@/lib/errors";

export async function GET(req: Request) {
  if (!validarCronSecret(req)) {
    return errorResponse("UNAUTHORIZED", "Secret inválido.", 401);
  }

  const { encolados, vencidos } = await CierrePeriodosClockService.encolarContratosVencidos();
  const { marcados: por_vencer } = await ContratosClockService.marcarContratosPorVencer();

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
