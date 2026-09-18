import { NextRequest, NextResponse } from "next/server";
import { LiquidacionesService } from "@/services/liquidaciones.service";
import { generarPdfLiquidacion } from "@/lib/liquidacion-pdf";
import { requireAuthenticatedUser } from "@/lib/auth-context";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";
import { withObservability } from "@/lib/observability/with-observability";

export const runtime = "nodejs";

async function getLiquidacionPdf(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthenticatedUser();
    const { id } = await params;
    const idLiquidacion = Number(id);

    if (!Number.isInteger(idLiquidacion) || idLiquidacion <= 0) {
      return errorResponse("NOT_FOUND", "Liquidación no encontrada.", 404);
    }

    const liquidacion = await LiquidacionesService.obtenerDetalle(idLiquidacion);
    if (!liquidacion) {
      return errorResponse("NOT_FOUND", "Liquidación no encontrada.", 404);
    }

    const pdf = await generarPdfLiquidacion(liquidacion);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="liquidacion-${liquidacion.id}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleServiceError(error);
  }
}

export const GET = withObservability(getLiquidacionPdf);
