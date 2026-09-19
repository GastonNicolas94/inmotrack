import { NextRequest, NextResponse } from "next/server";
import { Decimal } from "@prisma/client/runtime/client";
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
        participaciones: {
          include: {
            propiedad: {
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
        },
      },
    });

    if (!propietario) return errorResponse("NOT_FOUND", "Propietario no encontrado.", 404);

    const contratos = propietario.participaciones.flatMap((participacion) =>
      participacion.propiedad.contratos.map((contrato) => ({
        contrato,
        porcentaje: new Decimal(participacion.porcentaje),
      })),
    );
    const contratosActivos = contratos.filter(
      ({ contrato }) =>
        contrato.estado === "ACTIVO" ||
        contrato.estado === "MOROSO" ||
        contrato.estado === "POR_VENCER",
    );

    const deudaTotal = contratos.reduce((total, { contrato, porcentaje }) => {
      const deudaContrato = contrato.cargos.reduce(
        (subtotal, cargo) => subtotal.plus(calcularPendiente(cargo.monto, cargo.aplicaciones)),
        new Decimal(0),
      );
      return total.plus(deudaContrato.times(porcentaje).dividedBy(100));
    }, new Decimal(0));

    return NextResponse.json({
      id: propietario.id,
      nombre: propietario.nombre,
      contratos_activos: contratosActivos.length,
      deuda_inquilinos: deudaTotal.toDecimalPlaces(2).toNumber(),
    });
  } catch (e) {
    return handleServiceError(e);
  }
}

export const GET = withObservability(getResumenPropietario);
