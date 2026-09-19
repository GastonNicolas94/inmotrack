import { NextRequest, NextResponse } from "next/server";
import { LiquidacionesService } from "@/services/liquidaciones.service";
import { handleServiceError } from "@/lib/api-error-handler";
import { requireAuthenticatedUser } from "@/lib/auth-context";
import { withObservability } from "@/lib/observability/with-observability";

async function getPendientes(req: NextRequest) {
  try {
    await requireAuthenticatedUser();
    const idPropietario = Number(req.nextUrl.searchParams.get("id_propietario"));
    const hastaParam = req.nextUrl.searchParams.get("hasta");

    if (!Number.isInteger(idPropietario) || idPropietario <= 0 || !hastaParam) {
      return NextResponse.json(
        { message: "id_propietario y hasta son obligatorios." },
        { status: 400 },
      );
    }

    const hasta = new Date(hastaParam);
    if (Number.isNaN(hasta.getTime())) {
      return NextResponse.json({ message: "Fecha hasta inválida." }, { status: 400 });
    }

    const pendientes = await LiquidacionesService.listarPendientes(idPropietario, hasta);
    return NextResponse.json(pendientes);
  } catch (e) {
    return handleServiceError(e);
  }
}

export const GET = withObservability(getPendientes);
