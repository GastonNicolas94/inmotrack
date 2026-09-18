import { NextRequest, NextResponse } from "next/server";
import { LiquidacionesService } from "@/services/liquidaciones.service";
import { handleServiceError } from "@/lib/api-error-handler";
import { requireAdmin } from "@/lib/auth-context";
import { withObservability } from "@/lib/observability/with-observability";

async function postConfirmarPago(
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

export const POST = withObservability(postConfirmarPago);
