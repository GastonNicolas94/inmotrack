import { NextRequest, NextResponse } from "next/server";
import { AjustesContratoService } from "@/services/ajustes-contrato.service";
import { CierrePeriodosQueueService } from "@/services/cierre-periodos-queue.service";
import { aplicarAjusteContratoSchema } from "@/schemas/ajuste-contrato.schema";
import { assertCanWrite, requireAuthenticatedUser } from "@/lib/auth-context";
import { handleServiceError } from "@/lib/api-error-handler";
import { errorResponse } from "@/lib/errors";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; idAjuste: string }> },
) {
  try {
    const user = await requireAuthenticatedUser();
    assertCanWrite(user);
    const { id, idAjuste } = await params;
    const idContrato = Number(id);
    const parsed = aplicarAjusteContratoSchema.safeParse(await req.json());
    if (!parsed.success) {
      return errorResponse("AJUSTE_INVALIDO", parsed.error.issues[0]?.message ?? "Datos inválidos.", 400);
    }

    const resultado = await AjustesContratoService.aplicar(
      idContrato,
      Number(idAjuste),
      parsed.data,
      user.id,
    );

    try {
      await CierrePeriodosQueueService.publicar(resultado.outboxId);
    } catch (error) {
      console.error("No se pudo publicar el cierre de período en Vercel Queue", {
        outboxId: resultado.outboxId,
        error,
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
