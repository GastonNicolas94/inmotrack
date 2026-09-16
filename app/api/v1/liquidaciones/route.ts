import { NextRequest, NextResponse } from "next/server";
import { LiquidacionesService } from "@/services/liquidaciones.service";
import { generarLiquidacionSchema } from "@/schemas/liquidacion.schema";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";
import { assertCanWrite, requireAuthenticatedUser } from "@/lib/auth-context";
import { withObservability } from "@/lib/observability/with-observability";

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

    const liquidacion = await LiquidacionesService.generarParaPropietario(
      parsed.data.id_propietario,
      parsed.data.hasta,
      parsed.data.descontar_adelantos
    );
    return NextResponse.json(liquidacion, { status: 201 });
  } catch (e) {
    return handleServiceError(e);
  }
}

export const GET = withObservability(getLiquidaciones);
export const POST = withObservability(postLiquidacion);
