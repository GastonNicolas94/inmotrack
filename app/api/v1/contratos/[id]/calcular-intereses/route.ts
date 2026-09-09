import { NextRequest, NextResponse } from "next/server";
import { PunitoriosService } from "@/services/punitorios.service";
import { calcularInteresesSchema } from "@/schemas/calcular-intereses.schema";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";
import { auth } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return errorResponse("UNAUTHORIZED", "No autenticado.", 401);
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = calcularInteresesSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Datos inválidos.", 400, {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const resultado = await PunitoriosService.calcularIntereses(
      Number(id),
      parsed.data.ids_cargo,
      Number(session.user.id)
    );
    return NextResponse.json({
      generados: resultado.generados,
      monto_total: resultado.monto_total.toNumber(),
    });
  } catch (e) {
    return handleServiceError(e);
  }
}
