import { NextRequest, NextResponse } from "next/server";
import { GastosService } from "@/services/gastos.service";
import { gastoSchema } from "@/schemas/gasto.schema";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";

export async function GET() {
  try {
    const gastos = await GastosService.listar();
    return NextResponse.json(gastos);
  } catch (e) {
    return handleServiceError(e);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = gastoSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Datos inválidos.", 400, {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const gasto = await GastosService.crear(parsed.data);
    return NextResponse.json(gasto, { status: 201 });
  } catch (e) {
    return handleServiceError(e);
  }
}
