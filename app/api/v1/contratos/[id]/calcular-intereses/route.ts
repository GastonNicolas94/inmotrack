import { NextRequest, NextResponse } from "next/server";
import { PunitoriosService } from "@/services/punitorios.service";
import { calcularInteresesSchema } from "@/schemas/calcular-intereses.schema";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";
import { assertCanWrite, requireAuthenticatedUser } from "@/lib/auth-context";
import { withObservability } from "@/lib/observability/with-observability";

async function postCalcularIntereses(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthenticatedUser();
    assertCanWrite(user);
    const { id } = await params;
    const body = await req.json();
    const parsed = calcularInteresesSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Datos inválidos.", 400, {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const resultado = await PunitoriosService.calcularIntereses(
      Number(id),
      parsed.data.ids_cargo,
      user.id
    );
    return NextResponse.json({
      generados: resultado.generados,
      monto_total: resultado.monto_total.toNumber(),
    });
  } catch (e) {
    return handleServiceError(e);
  }
}

export const POST = withObservability(postCalcularIntereses);
