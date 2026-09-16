import { NextRequest, NextResponse } from "next/server";
import { AdelantosService } from "@/services/adelantos.service";
import { registrarAdelantoSchema } from "@/schemas/adelanto.schema";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";
import { requireAdmin, requireAuthenticatedUser } from "@/lib/auth-context";
import { withObservability } from "@/lib/observability/with-observability";

async function getAdelantos(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthenticatedUser();
    const { id } = await params;
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

async function postAdelanto(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdmin();
    const { id } = await params;
    const body = await req.json();
    const parsed = registrarAdelantoSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Datos inválidos.", 400, {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const adelanto = await AdelantosService.registrar({
      id_propietario: Number(id),
      monto: parsed.data.monto,
      id_usuario_creador: user.id,
    });
    return NextResponse.json(adelanto, { status: 201 });
  } catch (e) {
    return handleServiceError(e);
  }
}

export const GET = withObservability(getAdelantos);
export const POST = withObservability(postAdelanto);
