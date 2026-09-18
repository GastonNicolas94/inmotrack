import { NextRequest, NextResponse } from "next/server";
import { ContratosService } from "@/services/contratos.service";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";
import { assertCanWrite, requireAuthenticatedUser } from "@/lib/auth-context";
import { HttpError } from "@/lib/http-error";
import { withObservability } from "@/lib/observability/with-observability";
import { logger } from "@/lib/observability/logger";
import { DOMAIN_EVENTS } from "@/lib/observability/events";

async function postActivarContrato(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthenticatedUser();
    assertCanWrite(user);
    const { id } = await params;
    const contractId = Number(id);
    const contrato = await ContratosService.activar(contractId, user.id);
    logger.info(DOMAIN_EVENTS.CONTRACT_ACTIVATED, { contractId });
    return NextResponse.json(contrato);
  } catch (e) {
    logger.error(DOMAIN_EVENTS.CONTRACT_ACTIVATION_FAILED, {
      error: e instanceof Error ? { name: e.name, message: e.message } : { message: String(e) },
    });
    if (e instanceof HttpError) return handleServiceError(e);
    return errorResponse("CONTRATO_ERROR", String(e), 400);
  }
}

export const POST = withObservability(postActivarContrato);
