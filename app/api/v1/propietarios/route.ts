import { NextRequest, NextResponse } from "next/server";
import { PropietariosService } from "@/services/propietarios.service";
import { propietarioSchema } from "@/schemas/propietario.schema";
import { errorResponse } from "@/lib/errors";
import { auth } from "@/lib/auth";
import { aplicarMasking } from "@/lib/masking";

export async function GET() {
  const session = await auth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rol = (session?.user as any)?.rol ?? "EMPLEADO";

  const data = await PropietariosService.listar();
  return NextResponse.json(data.map((p) => aplicarMasking(p as never, rol)));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = propietarioSchema.safeParse(body);

  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Datos inválidos.", 400, {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const propietario = await PropietariosService.crear(parsed.data);
  return NextResponse.json(propietario, { status: 201 });
}
