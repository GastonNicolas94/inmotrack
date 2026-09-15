import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-context";
import { handleServiceError } from "@/lib/api-error-handler";
import { errorResponse } from "@/lib/errors";
import { resolverFechaOperativa } from "@/lib/fecha";
import {
  parseTestContractId,
  relojPruebasHabilitado,
  TEST_CLOCK_CONTRACT_COOKIE,
  TEST_CLOCK_COOKIE,
} from "@/lib/reloj-pruebas";
import { CierrePeriodosService } from "@/services/cierre-periodos.service";

const MAX_FILAS_POR_EJECUCION = 500;
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function POST(req: NextRequest) {
  try {
    if (!relojPruebasHabilitado()) {
      return errorResponse("NOT_FOUND", "Recurso no disponible.", 404);
    }

    await requireAdmin();
    const body = (await req.json()) as {
      fecha?: unknown;
      ejecutar?: unknown;
      idContrato?: unknown;
    };
    if (typeof body.fecha !== "string") {
      return errorResponse("FECHA_INVALIDA", "Debe indicar una fecha en formato YYYY-MM-DD.", 400);
    }

    const fecha = body.fecha;
    resolverFechaOperativa(fecha);
    const idContrato = parseTestContractId(body.idContrato);

    let resultado: {
      idContrato: number;
      encolados: number;
      vencidos: number;
      procesadas: number;
      limiteAlcanzado: boolean;
    } | null = null;

    if (body.ejecutar === true) {
      if (!idContrato) {
        return errorResponse("CONTRATO_INVALIDO", "Indicá un ID de contrato válido para ejecutar la prueba.", 400);
      }

      const { encolados, vencidos } = await CierrePeriodosService.encolarContratosVencidos(
        fecha,
        idContrato,
      );
      let procesadas = 0;
      while (procesadas < MAX_FILAS_POR_EJECUCION) {
        const { huboTrabajo } = await CierrePeriodosService.procesarUnaFilaDeCola(
          fecha,
          idContrato,
        );
        if (!huboTrabajo) break;
        procesadas += 1;
      }
      resultado = {
        idContrato,
        encolados,
        vencidos,
        procesadas,
        limiteAlcanzado: procesadas === MAX_FILAS_POR_EJECUCION,
      };
    }

    const response = NextResponse.json({ fecha, idContrato: idContrato ?? null, resultado });
    response.cookies.set(TEST_CLOCK_COOKIE, fecha, {
      ...COOKIE_OPTIONS,
      maxAge: 60 * 60 * 8,
    });
    if (idContrato) {
      response.cookies.set(TEST_CLOCK_CONTRACT_COOKIE, String(idContrato), {
        ...COOKIE_OPTIONS,
        maxAge: 60 * 60 * 8,
      });
    }
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
    response.cookies.set(TEST_CLOCK_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0 });
    response.cookies.set(TEST_CLOCK_CONTRACT_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0 });
    return response;
  } catch (error) {
    return handleServiceError(error);
  }
}
