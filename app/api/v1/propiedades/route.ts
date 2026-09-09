import { NextRequest, NextResponse } from "next/server";
import { PropiedadesService } from "@/services/propiedades.service";
import { propiedadSchema } from "@/schemas/propiedad.schema";
import { errorResponse } from "@/lib/errors";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const id_propietario = searchParams.get("id_propietario");

  const data = await PropiedadesService.listar(
    id_propietario ? Number(id_propietario) : undefined
  );
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = propiedadSchema.safeParse(body);

  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Datos inválidos.", 400, {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const propiedad = await PropiedadesService.crear(parsed.data);
  return NextResponse.json(propiedad, { status: 201 });
}
