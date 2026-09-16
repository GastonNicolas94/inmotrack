import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";
import { requireAdmin, requireAuthenticatedUser } from "@/lib/auth-context";
import { UsuariosService } from "@/services/usuarios.service";
import { invitarUsuarioSchema } from "@/schemas/usuario.schema";
import { z } from "zod";
import { withObservability } from "@/lib/observability/with-observability";

async function getUsuarios() {
  try {
    const actor = await requireAuthenticatedUser();
    const usuarios = await UsuariosService.listar(actor);
    return NextResponse.json(usuarios);
  } catch (e) {
    return handleServiceError(e);
  }
}

async function postUsuario(req: NextRequest) {
  try {
    const actor = await requireAdmin();
    const body = await req.json();
    const parsed = invitarUsuarioSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Datos inválidos.", 400);
    }

    const usuario = await UsuariosService.invitar(parsed.data, actor);
    return NextResponse.json(usuario, { status: 201 });
  } catch (e) {
    return handleServiceError(e);
  }
}

const delegacionSchema = z.object({
  id_usuario: z.number().int().positive(),
  puede_aprobar: z.boolean(),
});

async function patchUsuario(req: NextRequest) {
  try {
    await requireAdmin();
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
    return handleServiceError(e);
  }
}

export const GET = withObservability(getUsuarios);
export const POST = withObservability(postUsuario);
export const PATCH = withObservability(patchUsuario);
