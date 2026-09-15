import { NextRequest, NextResponse } from "next/server";
import { AjustesContratoService } from "@/services/ajustes-contrato.service";
import { aplicarAjusteContratoSchema } from "@/schemas/ajuste-contrato.schema";
import { assertCanWrite, requireAuthenticatedUser } from "@/lib/auth-context";
import { handleServiceError } from "@/lib/api-error-handler";
import { errorResponse } from "@/lib/errors";
import { HttpError } from "@/lib/http-error";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; idAjuste: string }> },
) {
  try {
    const user = await requireAuthenticatedUser();
    assertCanWrite(user);
    const { id, idAjuste } = await params;
    const parsed = aplicarAjusteContratoSchema.safeParse(await req.json());
    if (!parsed.success) {
      return errorResponse("AJUSTE_INVALIDO", parsed.error.issues[0]?.message ?? "Datos inválidos.", 400);
    }

    const resultado = await AjustesContratoService.aplicar(
      Number(id),
      Number(idAjuste),
      parsed.data,
      user.id,
    );

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
    if (error instanceof HttpError) return handleServiceError(error);
    return errorResponse("AJUSTE_ERROR", error instanceof Error ? error.message : String(error), 400);
  }
}
