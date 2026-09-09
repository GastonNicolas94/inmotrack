import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { z } from "zod";

export async function GET() {
  try {
    const usuarios = await prisma.usuario.findMany({
      select: { id: true, email: true, rol: true, puede_aprobar_liquidaciones: true },
      orderBy: { email: "asc" },
    });
    return NextResponse.json(usuarios);
  } catch (e) {
    console.error("[GET /api/v1/usuarios]", e);
    return errorResponse("SERVER_ERROR", String(e), 500);
  }
}

const delegacionSchema = z.object({
  id_usuario: z.number().int().positive(),
  puede_aprobar: z.boolean(),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((session?.user as any)?.rol !== "ADMIN") {
      return errorResponse("FORBIDDEN", "Solo el Administrador puede delegar permisos.", 403);
    }

    const body = await req.json();
    const parsed = delegacionSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Datos inválidos.", 400);
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id: parsed.data.id_usuario },
    });

    if (!usuario) return errorResponse("NOT_FOUND", "Usuario no encontrado.", 404);
    if (usuario.rol !== "EMPLEADO") {
      return errorResponse(
        "DELEGACION_ERROR",
        "Solo se puede delegar aprobación de liquidaciones a un Empleado.",
        400
      );
    }

    const actualizado = await prisma.usuario.update({
      where: { id: parsed.data.id_usuario },
      data: { puede_aprobar_liquidaciones: parsed.data.puede_aprobar },
      select: { id: true, email: true, rol: true, puede_aprobar_liquidaciones: true },
    });

    return NextResponse.json(actualizado);
  } catch (e) {
    console.error("[PATCH /api/v1/usuarios]", e);
    return errorResponse("SERVER_ERROR", String(e), 500);
  }
}
