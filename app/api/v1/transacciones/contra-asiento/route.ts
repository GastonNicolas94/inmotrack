import { NextRequest, NextResponse } from "next/server";
import { TransaccionesService } from "@/services/transacciones.service";
import { contraAsientoSchema } from "@/schemas/transaccion.schema";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";
import { requireAdmin } from "@/lib/auth-context";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin();
    const body = await req.json();
    const parsed = contraAsientoSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Datos inválidos.", 400, {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const contraAsiento = await TransaccionesService.crearContraAsiento({
      ...parsed.data,
      id_usuario_creador: user.id,
    });
    return NextResponse.json(contraAsiento, { status: 201 });
  } catch (e) {
    return handleServiceError(e);
  }
}
