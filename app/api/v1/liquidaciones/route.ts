import { NextRequest, NextResponse } from "next/server";
import { LiquidacionesService } from "@/services/liquidaciones.service";
import { generarLiquidacionSchema } from "@/schemas/liquidacion.schema";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";
import { assertCanWrite, requireAuthenticatedUser } from "@/lib/auth-context";
import { withObservability } from "@/lib/observability/with-observability";
import { logger } from "@/lib/observability/logger";
import { DOMAIN_EVENTS } from "@/lib/observability/events";

async function getLiquidaciones(req: NextRequest) {
  try {
    await requireAuthenticatedUser();
    const idPropietario = req.nextUrl.searchParams.get("id_propietario");
    const liquidaciones = await LiquidacionesService.listar(
      idPropietario ? Number(idPropietario) : undefined
    );
    return NextResponse.json(liquidaciones);
  } catch (e) {
    return handleServiceError(e);
  }
}

async function postLiquidacion(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();
    assertCanWrite(user);
    const body = await req.json();
    const parsed = generarLiquidacionSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Datos inválidos.", 400, {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const ownerId = parsed.data.id_propietario;
    const liquidacion = await LiquidacionesService.generarParaPropietario(
      ownerId,
      parsed.data.hasta,
      parsed.data.descontar_adelantos,
      parsed.data.conceptos
    );
    logger.info(DOMAIN_EVENTS.SETTLEMENT_GENERATED, {
      settlementId: liquidacion.id,
      ownerId,
    });
    return NextResponse.json(liquidacion, { status: 201 });
  } catch (e) {
    logger.error(DOMAIN_EVENTS.SETTLEMENT_FAILED, {
      error: e instanceof Error ? { name: e.name, message: e.message } : { message: String(e) },
    });
    return handleServiceError(e);
  }
}

export const GET = withObservability(getLiquidaciones);
export const POST = withObservability(postLiquidacion);
