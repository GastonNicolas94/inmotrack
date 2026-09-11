import { NextRequest, NextResponse } from "next/server";
import { PropiedadesService } from "@/services/propiedades.service";
import { propiedadSchema } from "@/schemas/propiedad.schema";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";
import { assertCanWrite, requireAuthenticatedUser } from "@/lib/auth-context";

export async function GET(req: NextRequest) {
  try {
    await requireAuthenticatedUser();
    const { searchParams } = req.nextUrl;
    const id_propietario = searchParams.get("id_propietario");

    const data = await PropiedadesService.listar(
      id_propietario ? Number(id_propietario) : undefined
    );
    return NextResponse.json(data);
  } catch (e) {
    return handleServiceError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();
    assertCanWrite(user);
    const body = await req.json();
    const parsed = propiedadSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Datos inválidos.", 400, {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const propiedad = await PropiedadesService.crear(parsed.data);
    return NextResponse.json(propiedad, { status: 201 });
  } catch (e) {
    return handleServiceError(e);
  }
}
