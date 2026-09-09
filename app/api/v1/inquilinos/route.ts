import { NextRequest, NextResponse } from "next/server";
import { InquilinosService } from "@/services/inquilinos.service";
import { inquilinoSchema } from "@/schemas/inquilino.schema";
import { errorResponse } from "@/lib/errors";
import { auth } from "@/lib/auth";
import { aplicarMasking } from "@/lib/masking";

export async function GET() {
  const session = await auth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rol = (session?.user as any)?.rol ?? "EMPLEADO";

  const data = await InquilinosService.listar();
  return NextResponse.json(data.map((i) => aplicarMasking(i as never, rol)));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = inquilinoSchema.safeParse(body);

  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Datos inválidos.", 400, {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const inquilino = await InquilinosService.crear(parsed.data);
  return NextResponse.json(inquilino, { status: 201 });
}
