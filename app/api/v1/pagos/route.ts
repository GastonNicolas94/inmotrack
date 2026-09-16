import { NextRequest, NextResponse } from "next/server";
import { PagosService } from "@/services/pagos.service";
import { pagoSchema } from "@/schemas/pago.schema";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";
import { assertCanWrite, requireAuthenticatedUser } from "@/lib/auth-context";
import { withObservability } from "@/lib/observability/with-observability";

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

    const resultado = await PagosService.registrar({
      ...parsed.data,
      id_usuario_creador: user.id,
    });
    return NextResponse.json(resultado, { status: 201 });
  } catch (e) {
    return handleServiceError(e);
  }
}

export const GET = withObservability(getPagos);
export const POST = withObservability(postPago);
