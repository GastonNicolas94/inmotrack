import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { LiquidacionesService } from "@/services/liquidaciones.service";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";
import { auth } from "@/lib/auth";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return errorResponse("UNAUTHORIZED", "No autenticado.", 401);
  }

  const userId = Number(session.user.id);
  const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id: userId } });

  const puedeAprobar = usuario.rol === "ADMIN" || usuario.puede_aprobar_liquidaciones;
  if (!puedeAprobar) {
    return errorResponse("FORBIDDEN", "No tenés permiso para aprobar liquidaciones.", 403);
  }

  const { id } = await params;
  try {
    const liquidacion = await LiquidacionesService.aprobar(Number(id), userId);
    return NextResponse.json(liquidacion);
  } catch (e) {
    return handleServiceError(e);
  }
}
