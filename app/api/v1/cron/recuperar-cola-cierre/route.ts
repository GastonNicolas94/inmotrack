import { NextResponse } from "next/server";
import { validarCronSecret } from "@/lib/cron-auth";
import { AppClock } from "@/lib/app-clock";
import { errorResponse } from "@/lib/errors";
import { CierrePeriodosService } from "@/services/cierre-periodos.service";
import { CierrePeriodosQueueService } from "@/services/cierre-periodos-queue.service";

const ANTIGUEDAD_MINIMA_MS = 60_000;

export async function GET(req: Request) {
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
    console.error("Falló la republicación de filas pendientes en Vercel Queue", {
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
