import { NextRequest, NextResponse } from "next/server";
import { PropiedadesService } from "@/services/propiedades.service";
import { propiedadSchema } from "@/schemas/propiedad.schema";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";
import { assertCanWrite, requireAuthenticatedUser } from "@/lib/auth-context";
import { withObservability } from "@/lib/observability/with-observability";

async function putPropiedad(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuthenticatedUser();
    assertCanWrite(user);

    const { id } = await params;
    const idPropiedad = Number(id);
    if (!Number.isInteger(idPropiedad) || idPropiedad <= 0) {
      return errorResponse("VALIDATION_ERROR", "Propiedad inválida.", 400);
    }

    const body = await req.json();
    const parsed = propiedadSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Datos inválidos.", 400, {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const propiedad = await PropiedadesService.actualizar(idPropiedad, parsed.data);
    return NextResponse.json(propiedad);
  } catch (e) {
    return handleServiceError(e);
  }
}

export const PUT = withObservability(putPropiedad);
