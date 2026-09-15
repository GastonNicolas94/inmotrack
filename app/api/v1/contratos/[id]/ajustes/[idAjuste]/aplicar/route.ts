import { NextRequest, NextResponse, after } from "next/server";
import { AjustesContratoService } from "@/services/ajustes-contrato.service";
import { aplicarAjusteContratoSchema } from "@/schemas/ajuste-contrato.schema";
import { assertCanWrite, requireAuthenticatedUser } from "@/lib/auth-context";
import { handleServiceError } from "@/lib/api-error-handler";
import { errorResponse } from "@/lib/errors";
import {
  relojPruebasHabilitado,
  TEST_CLOCK_COOKIE,
  TEST_CLOCK_HEADER,
} from "@/lib/reloj-pruebas";

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

    const fechaPrueba = relojPruebasHabilitado()
      ? req.cookies.get(TEST_CLOCK_COOKIE)?.value
      : undefined;

    after(async () => {
      const secret = process.env.CRON_SECRET;
      if (!secret) return;
      const url = new URL("/api/v1/cron/procesar-cola-cierre", req.url);
      const headers: Record<string, string> = { Authorization: `Bearer ${secret}` };
      if (fechaPrueba) headers[TEST_CLOCK_HEADER] = fechaPrueba;
      await fetch(url, {
        method: "POST",
        headers,
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
    return handleServiceError(error);
  }
}
