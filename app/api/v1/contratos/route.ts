import { NextRequest, NextResponse } from "next/server";
import { ContratosService } from "@/services/contratos.service";
import { contratoSchema } from "@/schemas/contrato.schema";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";
import { assertCanWrite, requireAuthenticatedUser } from "@/lib/auth-context";
import { withObservability } from "@/lib/observability/with-observability";
import { logger } from "@/lib/observability/logger";
import { DOMAIN_EVENTS } from "@/lib/observability/events";

async function getContratos(req: NextRequest) {
  try {
    await requireAuthenticatedUser();
    const { searchParams } = req.nextUrl;
    const data = await ContratosService.listar({
      estado: searchParams.get("estado") ?? undefined,
      id_propietario: searchParams.get("id_propietario")
        ? Number(searchParams.get("id_propietario"))
        : undefined,
      id_inquilino: searchParams.get("id_inquilino")
        ? Number(searchParams.get("id_inquilino"))
        : undefined,
    });
    return NextResponse.json(data);
  } catch (e) {
    return handleServiceError(e);
  }
}

async function postContrato(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();
    assertCanWrite(user);
    const body = await req.json();
    const parsed = contratoSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Datos inválidos.", 400, {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const contrato = await ContratosService.crear(parsed.data);
    logger.info(DOMAIN_EVENTS.CONTRACT_CREATED, { contractId: contrato.id });
    return NextResponse.json(contrato, { status: 201 });
  } catch (e) {
    return handleServiceError(e);
  }
}

export const GET = withObservability(getContratos);
export const POST = withObservability(postContrato);
