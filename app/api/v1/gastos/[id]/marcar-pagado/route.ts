import { NextRequest, NextResponse } from "next/server";
import { GastosService } from "@/services/gastos.service";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";
import { auth } from "@/lib/auth";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return errorResponse("UNAUTHORIZED", "No autenticado.", 401);
  }

  const { id } = await params;
  try {
    const gasto = await GastosService.marcarPagado(Number(id), Number(session.user.id));
    return NextResponse.json(gasto);
  } catch (e) {
    return handleServiceError(e);
  }
}
