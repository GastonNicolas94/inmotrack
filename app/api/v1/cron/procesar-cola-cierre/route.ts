import { NextResponse, after } from "next/server";
import { validarCronSecret } from "@/lib/cron-auth";
import { CierrePeriodosService } from "@/services/cierre-periodos.service";
import { errorResponse } from "@/lib/errors";

export async function POST(req: Request) {
  if (!validarCronSecret(req)) {
    return errorResponse("UNAUTHORIZED", "Secret inválido.", 401);
  }

  const { huboTrabajo } = await CierrePeriodosService.procesarUnaFilaDeCola();

  if (huboTrabajo) {
    // Se re-dispara a sí mismo sin esperar — la próxima invocación decide
    // en su propio paso si queda más trabajo o si la cadena se apaga.
    after(async () => {
      const secret = process.env.CRON_SECRET;
      const url = new URL("/api/v1/cron/procesar-cola-cierre", req.url);
      await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
      }).catch(() => {});
    });
  }

  return NextResponse.json({ huboTrabajo });
}
