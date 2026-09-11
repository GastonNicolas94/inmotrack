import { NextRequest, NextResponse } from "next/server";
import { Decimal } from "@prisma/client/runtime/client";
import { prisma } from "@/lib/db";
import { calcularPendiente } from "@/lib/saldos";
import { calcularEstadoCobranza } from "@/lib/estado-cobranza";
import { handleServiceError } from "@/lib/api-error-handler";
import { requireAuthenticatedUser } from "@/lib/auth-context";

// Resumen por período (una fila por período, no por Cargo) — usado por el
// modal de "Períodos" del contrato. El libro mayor completo (todos los
// movimientos, sin filtrar por período) vive en
// ContratosService.obtenerMovimientosContrato, consumido por la página
// /contratos/[id]/movimientos.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthenticatedUser();
    const { id } = await params;
    const periodos = await prisma.periodoPago.findMany({
    where: { id_contrato: Number(id) },
    include: { cargos: { include: { aplicaciones: true } } },
    orderBy: { periodo: "desc" },
  });

  const respuesta = periodos.map((p) => {
    const vencido = p.fecha_vencimiento < new Date();

    const montoTotal = p.cargos.reduce((acc, c) => acc.plus(new Decimal(c.monto)), new Decimal(0));
    const saldoPendiente = p.cargos.reduce(
      (acc, c) => acc.plus(calcularPendiente(c.monto, c.aplicaciones)),
      new Decimal(0)
    );
    const estadoCobranza = calcularEstadoCobranza({
      montoTotal,
      montoPendiente: saldoPendiente,
      vencido,
    });

    return {
      id: p.id,
      periodo: p.periodo,
      fecha_vencimiento: p.fecha_vencimiento,
      estado_ciclo: p.estado_ciclo,
      estado_cobranza: estadoCobranza,
      saldo_pendiente: saldoPendiente,
    };
  });

    return NextResponse.json(respuesta);
  } catch (e) {
    return handleServiceError(e);
  }
}
