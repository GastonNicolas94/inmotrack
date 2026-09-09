import { NextRequest, NextResponse } from "next/server";
import { ContratosService } from "@/services/contratos.service";
import { errorResponse } from "@/lib/errors";
import { auth } from "@/lib/auth";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const idUsuario = session?.user?.id ? Number(session.user.id) : null;

  try {
    const contrato = await ContratosService.activar(Number(id), idUsuario);
    return NextResponse.json(contrato);
  } catch (e) {
    return errorResponse("CONTRATO_ERROR", String(e), 400);
  }
}
