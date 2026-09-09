import { NextRequest, NextResponse } from "next/server";
import { ContratosService } from "@/services/contratos.service";
import { contratoSchema } from "@/schemas/contrato.schema";
import { errorResponse } from "@/lib/errors";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const data = await ContratosService.listar({
    estado: searchParams.get("estado") ?? undefined,
    id_propietario: searchParams.get("id_propietario")
      ? Number(searchParams.get("id_propietario"))
      : undefined,
    id_inquilino: searchParams.get("id_inquilino")
      ? Number(searchParams.get("id_inquilino"))
      : undefined,
  });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = contratoSchema.safeParse(body);

  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Datos inválidos.", 400, {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const contrato = await ContratosService.crear(parsed.data);
    return NextResponse.json(contrato, { status: 201 });
  } catch (e) {
    return errorResponse("SERVER_ERROR", String(e), 500);
  }
}
