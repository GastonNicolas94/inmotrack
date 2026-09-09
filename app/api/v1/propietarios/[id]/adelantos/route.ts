import { NextRequest, NextResponse } from "next/server";
import { AdelantosService } from "@/services/adelantos.service";
import { registrarAdelantoSchema } from "@/schemas/adelanto.schema";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";
import { auth } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const pendiente = await AdelantosService.obtenerPendiente(Number(id));
    return NextResponse.json({
      total: pendiente.total.toString(),
      detalle: pendiente.detalle.map((d) => ({
        id_transaccion: d.id_transaccion,
        fecha_transaccion: d.fecha_transaccion,
        pendiente: d.pendiente.toString(),
      })),
    });
  } catch (e) {
    return handleServiceError(e);
  }
}

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
  const parsed = registrarAdelantoSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Datos inválidos.", 400, {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const adelanto = await AdelantosService.registrar({
      id_propietario: Number(id),
      monto: parsed.data.monto,
      id_usuario_creador: Number(session.user.id),
    });
    return NextResponse.json(adelanto, { status: 201 });
  } catch (e) {
    return handleServiceError(e);
  }
}
