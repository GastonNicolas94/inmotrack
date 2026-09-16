import { NextRequest, NextResponse } from "next/server";
import { PagosService } from "@/services/pagos.service";
import { pagoSchema } from "@/schemas/pago.schema";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";
import { assertCanWrite, requireAuthenticatedUser } from "@/lib/auth-context";
import { withObservability } from "@/lib/observability/with-observability";
import { logger } from "@/lib/observability/logger";
import { DOMAIN_EVENTS } from "@/lib/observability/events";

async function getPagos() {
  try {
    await requireAuthenticatedUser();
    const pagos = await PagosService.listarRecientes();
    return NextResponse.json(pagos);
  } catch (e) {
    return handleServiceError(e);
  }
}

async function postPago(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();
    assertCanWrite(user);
    const body = await req.json();
    const parsed = pagoSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Datos inválidos.", 400, {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const contractId = parsed.data.id_contrato;
    const resultado = await PagosService.registrar({
      ...parsed.data,
      id_usuario_creador: user.id,
    });
    logger.info(DOMAIN_EVENTS.PAYMENT_CREATED, { contractId });
    return NextResponse.json(resultado, { status: 201 });
  } catch (e) {
    logger.error(DOMAIN_EVENTS.PAYMENT_FAILED, {
      error: e instanceof Error ? { name: e.name, message: e.message } : { message: String(e) },
    });
    return handleServiceError(e);
  }
}

export const GET = withObservability(getPagos);
export const POST = withObservability(postPago);
