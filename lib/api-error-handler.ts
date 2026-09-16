import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { IdempotencyConflictError } from "@/lib/idempotency";
import { errorResponse } from "@/lib/errors";
import { HttpError } from "@/lib/http-error";
import { captureException } from "@/lib/observability/sentry-runtime";

/**
 * Traduce un error lanzado por la capa de servicio a una respuesta HTTP.
 * Los services lanzan `new Error("mensaje")` para violaciones de reglas de
 * negocio (ej. "Solo se pueden aprobar liquidaciones en estado PENDIENTE") —
 * esas se traducen a 400. Prisma `findUniqueOrThrow` sin resultado (P2025) a
 * 404. Otros errores conocidos de Prisma son fallos técnicos y se traducen a
 * 500 para no disfrazar incidentes de infraestructura como errores del cliente.
 */
export function handleServiceError(e: unknown): NextResponse {
  if (e instanceof HttpError) {
    return errorResponse(e.code, e.message, e.status);
  }
  if (e instanceof IdempotencyConflictError) {
    return errorResponse("IDEMPOTENCY_CONFLICT", e.message, 409);
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2025") {
      return errorResponse("NOT_FOUND", "El recurso no existe.", 404);
    }

    captureException(e, {
      tags: {
        layer: "database",
        prisma_code: e.code,
      },
    });
    return errorResponse("SERVER_ERROR", "Error interno del servidor.", 500);
  }
  if (e instanceof Error) {
    return errorResponse("BUSINESS_RULE_VIOLATION", e.message, 400);
  }
  captureException(e, { tags: { layer: "service" } });
  return errorResponse("SERVER_ERROR", "Error interno del servidor.", 500);
}
