import { NextRequest, NextResponse } from "next/server";
import { LiquidacionesService } from "@/services/liquidaciones.service";
import { handleServiceError } from "@/lib/api-error-handler";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const liquidacion = await LiquidacionesService.confirmarPago(Number(id));
    return NextResponse.json(liquidacion);
  } catch (e) {
    return handleServiceError(e);
  }
}
