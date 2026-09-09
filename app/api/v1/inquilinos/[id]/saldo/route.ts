import { NextRequest, NextResponse } from "next/server";
import { InquilinosService } from "@/services/inquilinos.service";
import { errorResponse } from "@/lib/errors";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const inquilino = await InquilinosService.obtenerPorId(Number(id));
  if (!inquilino) return errorResponse("NOT_FOUND", "Inquilino no encontrado.", 404);

  const saldo = await InquilinosService.obtenerSaldo(Number(id));

  // Garantizar que los totales nunca sean null — protección ante edge cases.
  // Punitorios ya no se omite: desde el motor de punitorios (2026-08-26,
  // docs/superpowers/specs/2026-08-26-motor-punitorios-design.md) los
  // Cargo PUNITORIO son datos reales, generados a pedido desde el botón
  // "Calcular intereses" de cada contrato — mostrarlos acá ya es correcto.
  return NextResponse.json({
    deuda_alquiler: saldo.deuda_alquiler ?? 0,
    punitorios: saldo.punitorios ?? 0,
    deuda_gastos: saldo.deuda_gastos ?? 0,
    total: saldo.total ?? 0,
    detalle_periodos: saldo.detalle_periodos ?? [],
    detalle_gastos: saldo.detalle_gastos ?? [],
  });
}
