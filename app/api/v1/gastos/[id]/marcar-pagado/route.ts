import { NextRequest, NextResponse } from "next/server";
import { GastosService } from "@/services/gastos.service";
import { handleServiceError } from "@/lib/api-error-handler";
import { assertCanWrite, requireAuthenticatedUser } from "@/lib/auth-context";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthenticatedUser();
    assertCanWrite(user);
    const { id } = await params;
    const gasto = await GastosService.marcarPagado(Number(id), user.id);
    return NextResponse.json(gasto);
  } catch (e) {
    return handleServiceError(e);
  }
}
