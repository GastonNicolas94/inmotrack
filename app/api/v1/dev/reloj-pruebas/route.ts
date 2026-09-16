import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-context";
import { handleServiceError } from "@/lib/api-error-handler";
import { errorResponse } from "@/lib/errors";
import { relojPruebasHabilitado } from "@/lib/reloj-pruebas";
import { EditableTestClock } from "@/lib/app-clock";
import { CierrePeriodosService } from "@/services/cierre-periodos.service";

const MAX_FILAS_POR_EJECUCION = 500;

export async function GET() {
  try {
    if (!relojPruebasHabilitado()) return errorResponse("NOT_FOUND", "Recurso no disponible.", 404);
    await requireAdmin();
    return NextResponse.json({ fecha: await EditableTestClock.getDate() });
  } catch (error) {
    return handleServiceError(error);
  }
}

export async function POST(req: Request) {
  try {
    if (!relojPruebasHabilitado()) return errorResponse("NOT_FOUND", "Recurso no disponible.", 404);

    await requireAdmin();
    const body = (await req.json()) as { fecha?: unknown; ejecutar?: unknown };
    if (typeof body.fecha !== "string") {
      return errorResponse("FECHA_INVALIDA", "Debe indicar una fecha en formato YYYY-MM-DD.", 400);
    }

    await EditableTestClock.setDate(body.fecha);

    let resultado: {
      encolados: number;
      vencidos: number;
      procesadas: number;
      limiteAlcanzado: boolean;
    } | null = null;

    if (body.ejecutar === true) {
      const { encolados, vencidos } = await CierrePeriodosService.encolarContratosVencidos();
      let procesadas = 0;
      while (procesadas < MAX_FILAS_POR_EJECUCION) {
        const { huboTrabajo } = await CierrePeriodosService.procesarUnaFilaDeCola();
        if (!huboTrabajo) break;
        procesadas += 1;
      }
      resultado = { encolados, vencidos, procesadas, limiteAlcanzado: procesadas === MAX_FILAS_POR_EJECUCION };
    }

    return NextResponse.json({ fecha: body.fecha, resultado });
  } catch (error) {
    return handleServiceError(error);
  }
}

export async function DELETE() {
  try {
    if (!relojPruebasHabilitado()) return errorResponse("NOT_FOUND", "Recurso no disponible.", 404);
    await requireAdmin();
    await EditableTestClock.clear();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleServiceError(error);
  }
}
