import { NextRequest, NextResponse } from "next/server";
import { AjustesContratoService } from "@/services/ajustes-contrato.service";
import { CierrePeriodosQueueService } from "@/services/cierre-periodos-queue.service";
import { aplicarAjusteContratoSchema } from "@/schemas/ajuste-contrato.schema";
import { assertCanWrite, requireAuthenticatedUser } from "@/lib/auth-context";
import { handleServiceError } from "@/lib/api-error-handler";
import { errorResponse } from "@/lib/errors";
import { withObservability } from "@/lib/observability/with-observability";
import { logger } from "@/lib/observability/logger";
import { DOMAIN_EVENTS } from "@/lib/observability/events";

async function postAplicarAjuste(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; idAjuste: string }> },
) {
  try {
    const user = await requireAuthenticatedUser();
    assertCanWrite(user);
    const { id, idAjuste } = await params;
    const idContrato = Number(id);
    const ajusteId = Number(idAjuste);
    const parsed = aplicarAjusteContratoSchema.safeParse(await req.json());
    if (!parsed.success) {
      return errorResponse("AJUSTE_INVALIDO", parsed.error.issues[0]?.message ?? "Datos inválidos.", 400);
    }

    const resultado = await AjustesContratoService.aplicar(
      idContrato,
      ajusteId,
      parsed.data,
      user.id,
    );

    logger.info(DOMAIN_EVENTS.CONTRACT_ADJUSTMENT_APPLIED, {
      contractId: idContrato,
      adjustmentId: ajusteId,
      outboxId: resultado.outboxId,
    });

    try {
      await CierrePeriodosQueueService.publicar(resultado.outboxId);
    } catch (error) {
      logger.error("queue.publish.failed", {
        outboxId: resultado.outboxId,
        source: "contract.adjustment_applied",
        error: error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
      });
    }

    return NextResponse.json({
      contrato: {
        ...resultado.contrato,
        monto_base: resultado.contrato.monto_base.toString(),
      },
      ajuste: {
        ...resultado.ajuste,
        monto_anterior: resultado.ajuste.monto_anterior.toString(),
        monto_nuevo: resultado.ajuste.monto_nuevo?.toString() ?? null,
      },
    });
  } catch (error) {
    return handleServiceError(error);
  }
}

export const POST = withObservability(postAplicarAjuste);
