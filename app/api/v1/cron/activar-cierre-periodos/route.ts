import { NextResponse, after } from "next/server";
import { validarCronSecret } from "@/lib/cron-auth";
import { CierrePeriodosService } from "@/services/cierre-periodos.service";
import { ContratosService } from "@/services/contratos.service";
import { errorResponse } from "@/lib/errors";

export async function GET(req: Request) {
  if (!validarCronSecret(req)) {
    return errorResponse("UNAUTHORIZED", "Secret inválido.", 401);
  }

  const { encolados, vencidos } = await CierrePeriodosService.encolarContratosVencidos();
  // Alerta pura (no toca períodos ni cargos) — corre en la misma corrida
  // mensual, sin depender de la cadena de after() de la cola.
  const { marcados: por_vencer } = await ContratosService.marcarContratosPorVencer();

  // Dispara la cadena de procesamiento sin esperarla — el cron se olvida
  // apenas responde, la cola se sostiene sola desde acá en adelante.
  after(async () => {
    const secret = process.env.CRON_SECRET;
    const url = new URL("/api/v1/cron/procesar-cola-cierre", req.url);
    await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    }).catch(() => {
      // Fire-and-forget real: un error de red acá no debe tirar abajo esta
      // respuesta (que ya se mandó). La próxima corrida mensual del cron
      // vuelve a encontrar los contratos que quedaron sin procesar.
    });
  });

  return NextResponse.json({ encolados, vencidos, por_vencer });
}
