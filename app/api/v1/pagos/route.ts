import { NextRequest, NextResponse } from "next/server";
import { PagosService } from "@/services/pagos.service";
import { pagoSchema } from "@/schemas/pago.schema";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";
import { auth } from "@/lib/auth";

export async function GET() {
  try {
    const pagos = await PagosService.listarRecientes();
    return NextResponse.json(pagos);
  } catch (e) {
    return handleServiceError(e);
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return errorResponse("UNAUTHORIZED", "No autenticado.", 401);
  }

  const body = await req.json();
  const parsed = pagoSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Datos inválidos.", 400, {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const resultado = await PagosService.registrar({
      ...parsed.data,
      id_usuario_creador: Number(session.user.id),
    });
    return NextResponse.json(resultado, { status: 201 });
  } catch (e) {
    return handleServiceError(e);
  }
}
