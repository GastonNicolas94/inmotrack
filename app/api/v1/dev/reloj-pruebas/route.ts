import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-context";
import { handleServiceError } from "@/lib/api-error-handler";
import { errorResponse } from "@/lib/errors";
import { resolverFechaOperativa } from "@/lib/fecha";
import {
  relojPruebasHabilitado,
  TEST_CLOCK_COOKIE,
} from "@/lib/reloj-pruebas";
import { CierrePeriodosService } from "@/services/cierre-periodos.service";

const MAX_FILAS_POR_EJECUCION = 500;

export async function POST(req: NextRequest) {
  try {
    if (!relojPruebasHabilitado()) {
      return errorResponse("NOT_FOUND", "Recurso no disponible.", 404);
    }

    await requireAdmin();
    const body = (await req.json()) as { fecha?: unknown; ejecutar?: unknown };
    if (typeof body.fecha !== "string") {
      return errorResponse("FECHA_INVALIDA", "Debe indicar una fecha en formato YYYY-MM-DD.", 400);
    }

    const fecha = body.fecha;
    resolverFechaOperativa(fecha);

    let resultado: {
      encolados: number;
      vencidos: number;
      procesadas: number;
      limiteAlcanzado: boolean;
    } | null = null;

    if (body.ejecutar === true) {
      const { encolados, vencidos } = await CierrePeriodosService.encolarContratosVencidos(fecha);
      let procesadas = 0;
      while (procesadas < MAX_FILAS_POR_EJECUCION) {
        const { huboTrabajo } = await CierrePeriodosService.procesarUnaFilaDeCola(fecha);
        if (!huboTrabajo) break;
        procesadas += 1;
      }
      resultado = {
        encolados,
        vencidos,
        procesadas,
        limiteAlcanzado: procesadas === MAX_FILAS_POR_EJECUCION,
      };
    }

    const response = NextResponse.json({ fecha, resultado });
    response.cookies.set(TEST_CLOCK_COOKIE, fecha, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    return response;
  } catch (error) {
    return handleServiceError(error);
  }
}

export async function DELETE() {
  try {
    if (!relojPruebasHabilitado()) {
      return errorResponse("NOT_FOUND", "Recurso no disponible.", 404);
    }
    await requireAdmin();
    const response = NextResponse.json({ ok: true });
    response.cookies.set(TEST_CLOCK_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return handleServiceError(error);
  }
}
