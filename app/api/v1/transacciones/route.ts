import { NextRequest, NextResponse } from "next/server";
import { TransaccionesService } from "@/services/transacciones.service";
import { handleServiceError } from "@/lib/api-error-handler";
import { requireAuthenticatedUser } from "@/lib/auth-context";
import { withObservability } from "@/lib/observability/with-observability";

async function getTransacciones(req: NextRequest) {
  try {
    await requireAuthenticatedUser();
    const { searchParams } = req.nextUrl;
    const transacciones = await TransaccionesService.listar({
      tipo: searchParams.get("tipo") ?? undefined,
      caja_destino: searchParams.get("caja") ?? undefined,
      id_contrato: searchParams.get("id_contrato")
        ? Number(searchParams.get("id_contrato"))
        : undefined,
      desde: searchParams.get("desde") ? new Date(searchParams.get("desde")!) : undefined,
      hasta: searchParams.get("hasta") ? new Date(searchParams.get("hasta")!) : undefined,
    });
    return NextResponse.json(transacciones);
  } catch (e) {
    return handleServiceError(e);
  }
}

export const GET = withObservability(getTransacciones);
