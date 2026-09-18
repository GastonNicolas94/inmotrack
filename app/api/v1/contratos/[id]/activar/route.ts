import { NextRequest, NextResponse } from "next/server";
import { ContratosService } from "@/services/contratos.service";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";
import { assertCanWrite, requireAuthenticatedUser } from "@/lib/auth-context";
import { HttpError } from "@/lib/http-error";
import { withObservability } from "@/lib/observability/with-observability";

async function postActivarContrato(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthenticatedUser();
    assertCanWrite(user);
    const { id } = await params;
    const contrato = await ContratosService.activar(Number(id), user.id);
    return NextResponse.json(contrato);
  } catch (e) {
    if (e instanceof HttpError) return handleServiceError(e);
    return errorResponse("CONTRATO_ERROR", String(e), 400);
  }
}

export const POST = withObservability(postActivarContrato);
