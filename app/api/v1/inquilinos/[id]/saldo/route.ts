import { NextRequest, NextResponse } from "next/server";
import { InquilinosService } from "@/services/inquilinos.service";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";
import { requireAuthenticatedUser } from "@/lib/auth-context";
import { withObservability } from "@/lib/observability/with-observability";

async function getSaldoInquilino(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthenticatedUser();
    const { id } = await params;
    const inquilino = await InquilinosService.obtenerPorId(Number(id));
    if (!inquilino) return errorResponse("NOT_FOUND", "Inquilino no encontrado.", 404);

    const saldo = await InquilinosService.obtenerSaldo(Number(id));

    return NextResponse.json({
      deuda_alquiler: saldo.deuda_alquiler ?? 0,
      punitorios: saldo.punitorios ?? 0,
      deuda_gastos: saldo.deuda_gastos ?? 0,
      deuda_confeccion: saldo.deuda_confeccion ?? 0,
      total: saldo.total ?? 0,
      detalle_periodos: saldo.detalle_periodos ?? [],
      detalle_gastos: saldo.detalle_gastos ?? [],
      detalle_confeccion: saldo.detalle_confeccion ?? [],
    });
  } catch (e) {
    return handleServiceError(e);
  }
}

export const GET = withObservability(getSaldoInquilino);
