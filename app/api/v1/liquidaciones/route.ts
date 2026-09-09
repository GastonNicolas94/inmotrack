import { NextRequest, NextResponse } from "next/server";
import { LiquidacionesService } from "@/services/liquidaciones.service";
import { generarLiquidacionSchema } from "@/schemas/liquidacion.schema";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";

export async function GET(req: NextRequest) {
  const idPropietario = req.nextUrl.searchParams.get("id_propietario");
  try {
    const liquidaciones = await LiquidacionesService.listar(
      idPropietario ? Number(idPropietario) : undefined
    );
    return NextResponse.json(liquidaciones);
  } catch (e) {
    return handleServiceError(e);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = generarLiquidacionSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Datos inválidos.", 400, {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  try {
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
