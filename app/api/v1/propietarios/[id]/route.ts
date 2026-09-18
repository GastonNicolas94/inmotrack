import { NextRequest, NextResponse } from "next/server";
import { PropietariosService } from "@/services/propietarios.service";
import { propietarioSchema } from "@/schemas/propietario.schema";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";
import { assertCanWrite, requireAuthenticatedUser } from "@/lib/auth-context";
import { withObservability } from "@/lib/observability/with-observability";

async function getPropietario(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthenticatedUser();
    const { id } = await params;
    const propietario = await PropietariosService.obtenerPorId(Number(id));
    if (!propietario) return errorResponse("NOT_FOUND", "Propietario no encontrado.", 404);
    return NextResponse.json(propietario);
  } catch (e) {
    return handleServiceError(e);
  }
}

async function patchPropietario(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthenticatedUser();
    assertCanWrite(user);
    const { id } = await params;
    const body = await req.json();
    const parsed = propietarioSchema.partial().safeParse(body);

    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Datos inválidos.", 400, {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const propietario = await PropietariosService.actualizar(Number(id), parsed.data);
    return NextResponse.json(propietario);
  } catch (e) {
    return handleServiceError(e);
  }
}

export const GET = withObservability(getPropietario);
export const PATCH = withObservability(patchPropietario);
