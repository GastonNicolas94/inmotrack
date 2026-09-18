import { NextRequest, NextResponse } from "next/server";
import { ContratosService } from "@/services/contratos.service";
import { errorResponse } from "@/lib/errors";
import { z } from "zod";
import { handleServiceError } from "@/lib/api-error-handler";
import { assertCanWrite, requireAuthenticatedUser } from "@/lib/auth-context";
import { HttpError } from "@/lib/http-error";
import { withObservability } from "@/lib/observability/with-observability";

const estadoSchema = z.object({
  estado: z.enum(["BORRADOR", "ACTIVO", "MOROSO", "POR_VENCER", "VENCIDO", "RESCINDIDO"]),
});

async function patchEstadoContrato(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthenticatedUser();
    assertCanWrite(user);
    const { id } = await params;
    const body = await req.json();
    const parsed = estadoSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Estado inválido.", 400);
    }

    const contrato = await ContratosService.cambiarEstado(Number(id), parsed.data.estado);
    return NextResponse.json(contrato);
  } catch (e) {
    if (e instanceof HttpError) return handleServiceError(e);
    return errorResponse("CONTRATO_ERROR", String(e), 400);
  }
}

export const PATCH = withObservability(patchEstadoContrato);
