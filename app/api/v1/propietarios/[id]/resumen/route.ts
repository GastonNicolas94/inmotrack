import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import { calcularPendiente } from "@/lib/saldos";
import { handleServiceError } from "@/lib/api-error-handler";
import { requireAuthenticatedUser } from "@/lib/auth-context";

export async function GET(
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
            // VENCIDO incluido: un contrato puede terminar con deuda real
            // sin cobrar (el cierre automático lo transiciona a VENCIDO
            // sin tocar sus Cargo) — excluirlo acá la volvería invisible
            // en el resumen del propietario.
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
  // "Activos" para el contador es ACTIVO/MOROSO/POR_VENCER (contratos en
  // curso) — un VENCIDO no está en curso, aunque su deuda siga contando
  // abajo. POR_VENCER es solo una alerta de renovación, sigue siendo un
  // contrato activo en todo sentido operativo.
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
