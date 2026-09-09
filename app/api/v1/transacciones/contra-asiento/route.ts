import { NextRequest, NextResponse } from "next/server";
import { TransaccionesService } from "@/services/transacciones.service";
import { contraAsientoSchema } from "@/schemas/transaccion.schema";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";
import { auth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return errorResponse("UNAUTHORIZED", "No autenticado.", 401);
  }

  const body = await req.json();
  const parsed = contraAsientoSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Datos inválidos.", 400, {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const contraAsiento = await TransaccionesService.crearContraAsiento({
      ...parsed.data,
      id_usuario_creador: Number(session.user.id),
    });
    return NextResponse.json(contraAsiento, { status: 201 });
  } catch (e) {
    return handleServiceError(e);
  }
}
