import { NextRequest, NextResponse } from "next/server";
import { ContratosService } from "@/services/contratos.service";
import { errorResponse } from "@/lib/errors";
import { z } from "zod";

const estadoSchema = z.object({
  estado: z.enum(["BORRADOR", "ACTIVO", "MOROSO", "POR_VENCER", "VENCIDO", "RESCINDIDO"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const parsed = estadoSchema.safeParse(body);

  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Estado inválido.", 400);
  }

  try {
    const contrato = await ContratosService.cambiarEstado(Number(id), parsed.data.estado);
    return NextResponse.json(contrato);
  } catch (e) {
    return errorResponse("CONTRATO_ERROR", String(e), 400);
  }
}
