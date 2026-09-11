import { NextRequest, NextResponse } from "next/server";
import { Decimal } from "@prisma/client/runtime/client";
import { prisma } from "@/lib/db";
import { calcularPendiente } from "@/lib/saldos";
import { handleServiceError } from "@/lib/api-error-handler";
import { requireAuthenticatedUser } from "@/lib/auth-context";

// Cargos pendientes de UN contrato puntual, en el orden real de prelación
// (creado_en asc), más el saldo a favor disponible — usado por
// ModalRegistrarPago para mostrar el desglose de deuda, avisar si ya hay
// crédito flotando sin aplicar, y simular en el cliente qué se cubriría
// con el monto ingresado (lib/prelacion.ts). Un GASTO a cargo del
// propietario/inmobiliaria nunca es deuda del inquilino, así que se
// excluye de los cargos — nunca lo cubre un pago.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthenticatedUser();
    const { id } = await params;
    const id_contrato = Number(id);

  const [cargos, cobros] = await Promise.all([
    prisma.cargo.findMany({
      where: { id_contrato },
      include: { aplicaciones: true, gasto: true, periodo: true },
      orderBy: { creado_en: "asc" },
    }),
    prisma.transaccion.findMany({
      where: { id_contrato, tipo: "INGRESO_COBRO" },
      include: { aplicaciones: true },
    }),
  ]);

  const pendientes = cargos
    .filter((c) => c.tipo !== "GASTO" || c.gasto?.cargo_a === "INQUILINO")
    .map((c) => ({
      id: c.id,
      tipo: c.tipo,
      periodo: c.periodo.periodo,
      monto: c.monto,
      pendiente: calcularPendiente(c.monto, c.aplicaciones),
    }))
    .filter((c) => c.pendiente.greaterThan(0));

  // Mismo cálculo que ContratosService.avanzarPeriodo al cerrar un
  // período: sobrante sin aplicar de cada cobro, sumado — nunca se
  // persiste, se recalcula siempre igual.
  const saldoAFavor = cobros.reduce(
    (acc, t) => acc.plus(Decimal.max(0, calcularPendiente(t.monto, t.aplicaciones))),
    new Decimal(0)
  );

    return NextResponse.json({ cargos: pendientes, saldo_a_favor: saldoAFavor });
  } catch (e) {
    return handleServiceError(e);
  }
}
