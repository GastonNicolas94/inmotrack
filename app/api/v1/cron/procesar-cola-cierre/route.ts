import { NextResponse, after } from "next/server";
import { validarCronSecret } from "@/lib/cron-auth";
import { CierrePeriodosService } from "@/services/cierre-periodos.service";
import { errorResponse } from "@/lib/errors";
import {
  parseTestContractId,
  relojPruebasHabilitado,
  TEST_CLOCK_CONTRACT_HEADER,
  TEST_CLOCK_HEADER,
} from "@/lib/reloj-pruebas";

export async function POST(req: Request) {
  if (!validarCronSecret(req)) {
    return errorResponse("UNAUTHORIZED", "Secret inválido.", 401);
  }

  const clockEnabled = relojPruebasHabilitado();
  const fechaPrueba = clockEnabled
    ? req.headers.get(TEST_CLOCK_HEADER) ?? undefined
    : undefined;
  const idContratoPrueba = clockEnabled
    ? parseTestContractId(req.headers.get(TEST_CLOCK_CONTRACT_HEADER))
    : undefined;

  const { huboTrabajo } = await CierrePeriodosService.procesarUnaFilaDeCola(
    fechaPrueba,
    idContratoPrueba,
  );

  if (huboTrabajo) {
    after(async () => {
      const secret = process.env.CRON_SECRET;
      const url = new URL("/api/v1/cron/procesar-cola-cierre", req.url);
      const headers: Record<string, string> = { Authorization: `Bearer ${secret}` };
      if (fechaPrueba && idContratoPrueba) {
        headers[TEST_CLOCK_HEADER] = fechaPrueba;
        headers[TEST_CLOCK_CONTRACT_HEADER] = String(idContratoPrueba);
      }
      await fetch(url, {
        method: "POST",
        headers,
      }).catch(() => {});
    });
  }

  return NextResponse.json({ huboTrabajo });
}
