import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import { calcularPendiente } from "@/lib/saldos";
import { handleServiceError } from "@/lib/api-error-handler";
import { requireAuthenticatedUser } from "@/lib/auth-context";
import { withObservability } from "@/lib/observability/with-observability";

async function getResumenPropietario(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthenticatedUser();
    const { id } = await params;

    const propietario = await prisma.propietario.findUnique({
      where: { id: Number(id) },
      include: {
        propiedades: {
          include: {
            contratos: {
              where: { estado: { in: ["ACTIVO", "MOROSO", "POR_VENCER", "VENCIDO"] } },
              include: {
                inquilino: true,
                cargos: { include: { aplicaciones: true } },
              },
            },
          },
        },
      },
    });

    if (!propietario) return errorResponse("NOT_FOUND", "Propietario no encontrado.", 404);

    const contratos = propietario.propiedades.flatMap((p) => p.contratos);
    const contratosActivos = contratos.filter(
      (c) => c.estado === "ACTIVO" || c.estado === "MOROSO" || c.estado === "POR_VENCER"
    );

    const deudaTotal = contratos
      .flatMap((c) => c.cargos)
      .reduce((acc, c) => acc + calcularPendiente(c.monto, c.aplicaciones).toNumber(), 0);

    return NextResponse.json({
      id: propietario.id,
      nombre: propietario.nombre,
      contratos_activos: contratosActivos.length,
      deuda_inquilinos: deudaTotal,
    });
  } catch (e) {
    return handleServiceError(e);
  }
}

export const GET = withObservability(getResumenPropietario);
