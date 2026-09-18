import { NextRequest, NextResponse } from "next/server";
import { AjustesContratoService } from "@/services/ajustes-contrato.service";
import { handleServiceError } from "@/lib/api-error-handler";
import { requireAuthenticatedUser } from "@/lib/auth-context";
import { withObservability } from "@/lib/observability/with-observability";

async function getAjustesContrato(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuthenticatedUser();
    const { id } = await params;
    const ajustes = await AjustesContratoService.listarPorContrato(Number(id));
    return NextResponse.json(
      ajustes.map((ajuste) => ({
        ...ajuste,
        monto_anterior: ajuste.monto_anterior.toString(),
        monto_nuevo: ajuste.monto_nuevo?.toString() ?? null,
      })),
    );
  } catch (error) {
    return handleServiceError(error);
  }
}

export const GET = withObservability(getAjustesContrato);
