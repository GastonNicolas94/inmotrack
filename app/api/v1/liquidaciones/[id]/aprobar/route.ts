import { NextRequest, NextResponse } from "next/server";
import { LiquidacionesService } from "@/services/liquidaciones.service";
import { handleServiceError } from "@/lib/api-error-handler";
import { assertCanApproveLiquidation, requireAuthenticatedUser } from "@/lib/auth-context";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthenticatedUser();
    assertCanApproveLiquidation(user);
    const { id } = await params;
    const liquidacion = await LiquidacionesService.aprobar(Number(id), user.id);
    return NextResponse.json(liquidacion);
  } catch (e) {
    return handleServiceError(e);
  }
}
