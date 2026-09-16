import { NextRequest, NextResponse } from "next/server";
import { PropietariosService } from "@/services/propietarios.service";
import { propietarioSchema } from "@/schemas/propietario.schema";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";
import { assertCanWrite, requireAuthenticatedUser } from "@/lib/auth-context";
import { aplicarMasking } from "@/lib/masking";
import { withObservability } from "@/lib/observability/with-observability";

async function getPropietarios() {
  try {
    const user = await requireAuthenticatedUser();
    const data = await PropietariosService.listar();
    return NextResponse.json(data.map((p) => aplicarMasking(p as never, user.rol)));
  } catch (e) {
    return handleServiceError(e);
  }
}

async function postPropietario(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();
    assertCanWrite(user);
    const body = await req.json();
    const parsed = propietarioSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Datos inválidos.", 400, {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const propietario = await PropietariosService.crear(parsed.data);
    return NextResponse.json(propietario, { status: 201 });
  } catch (e) {
    return handleServiceError(e);
  }
}

export const GET = withObservability(getPropietarios);
export const POST = withObservability(postPropietario);
