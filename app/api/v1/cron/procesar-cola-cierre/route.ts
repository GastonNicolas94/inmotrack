import { NextResponse } from "next/server";
import { validarCronSecret } from "@/lib/cron-auth";
import { CierrePeriodosService } from "@/services/cierre-periodos.service";
import { errorResponse } from "@/lib/errors";

export async function POST(req: Request) {
  if (!validarCronSecret(req)) {
    return errorResponse("UNAUTHORIZED", "Secret inválido.", 401);
  }

  const { huboTrabajo } = await CierrePeriodosService.procesarUnaFilaDeCola();
  return NextResponse.json({ huboTrabajo });
}
