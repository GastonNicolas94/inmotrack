import { NextRequest, NextResponse } from "next/server";
import { LiquidacionesService } from "@/services/liquidaciones.service";
import { handleServiceError } from "@/lib/api-error-handler";
import { requireAdmin } from "@/lib/auth-context";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const liquidacion = await LiquidacionesService.confirmarPago(Number(id));
    return NextResponse.json(liquidacion);
  } catch (e) {
    return handleServiceError(e);
  }
}
