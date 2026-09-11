import { NextRequest, NextResponse } from "next/server";
import { InquilinosService } from "@/services/inquilinos.service";
import { inquilinoSchema } from "@/schemas/inquilino.schema";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";
import { assertCanWrite, requireAuthenticatedUser } from "@/lib/auth-context";
import { aplicarMasking } from "@/lib/masking";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const data = await InquilinosService.listar();
    return NextResponse.json(data.map((i) => aplicarMasking(i as never, user.rol)));
  } catch (e) {
    return handleServiceError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();
    assertCanWrite(user);
    const body = await req.json();
    const parsed = inquilinoSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Datos inválidos.", 400, {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const inquilino = await InquilinosService.crear(parsed.data);
    return NextResponse.json(inquilino, { status: 201 });
  } catch (e) {
    return handleServiceError(e);
  }
}
