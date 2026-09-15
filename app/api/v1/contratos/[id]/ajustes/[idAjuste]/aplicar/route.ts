import { NextRequest, NextResponse, after } from "next/server";
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

    // Aplicar() deja una fila PENDIENTE en el outbox. El worker que había
    // detectado el ajuste ya terminó su cadena al quedar bloqueado, por lo
    // que esta mutación debe reactivar explícitamente el consumidor para
    // continuar el catch-up sin esperar al cron mensual siguiente.
    after(async () => {
      const secret = process.env.CRON_SECRET;
      if (!secret) return;
      const url = new URL("/api/v1/cron/procesar-cola-cierre", req.url);
      await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
      }).catch(() => {});
    });

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
