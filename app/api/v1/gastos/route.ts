import { NextRequest, NextResponse } from "next/server";
import { GastosService } from "@/services/gastos.service";
import { gastoSchema } from "@/schemas/gasto.schema";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";
import { assertCanWrite, requireAuthenticatedUser } from "@/lib/auth-context";
import { withObservability } from "@/lib/observability/with-observability";
import { logger } from "@/lib/observability/logger";
import { DOMAIN_EVENTS } from "@/lib/observability/events";

async function getGastos() {
  try {
    await requireAuthenticatedUser();
    const gastos = await GastosService.listar();
    return NextResponse.json(gastos);
  } catch (e) {
    return handleServiceError(e);
  }
}

async function postGasto(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();
    assertCanWrite(user);
    const body = await req.json();
    const parsed = gastoSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Datos inválidos.", 400, {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const gasto = await GastosService.crear(parsed.data);
    logger.info(DOMAIN_EVENTS.EXPENSE_CREATED, { expenseId: gasto.id });
    return NextResponse.json(gasto, { status: 201 });
  } catch (e) {
    return handleServiceError(e);
  }
}

export const GET = withObservability(getGastos);
export const POST = withObservability(postGasto);
