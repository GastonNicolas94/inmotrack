import { NextRequest, NextResponse } from "next/server";
import { LiquidacionesService } from "@/services/liquidaciones.service";
import { requireAuthenticatedUser } from "@/lib/auth-context";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";
import { withObservability } from "@/lib/observability/with-observability";

async function getLiquidacion(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthenticatedUser();
    const { id } = await params;
    const idLiquidacion = Number(id);

    if (!Number.isInteger(idLiquidacion) || idLiquidacion <= 0) {
      return errorResponse("NOT_FOUND", "Liquidación no encontrada.", 404);
    }

    const liquidacion = await LiquidacionesService.obtenerDetalle(idLiquidacion);
    if (!liquidacion) {
      return errorResponse("NOT_FOUND", "Liquidación no encontrada.", 404);
    }

    return NextResponse.json(liquidacion);
  } catch (e) {
    return handleServiceError(e);
  }
}

export const GET = withObservability(getLiquidacion);
