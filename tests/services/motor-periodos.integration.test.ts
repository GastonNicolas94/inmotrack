// tests/services/motor-periodos.integration.test.ts
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import { calcularPendiente } from "@/lib/saldos";
import { ContratosService } from "@/services/contratos.service";
import { PagosService } from "@/services/pagos.service";
import { InquilinosService } from "@/services/inquilinos.service";

describe("Motor de períodos — integración de extremo a extremo", () => {
  let propiedad: { id: number };
  let inquilino: { id: number };
  let usuario: { id: number };

  beforeEach(async () => {
    await cleanDatabase();
    const propietario = await prisma.propietario.create({
      data: { nombre: "Carlos", cbu: "0".repeat(22) },
    });
    propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle Falsa 123" },
    });
    inquilino = await prisma.inquilino.create({
      data: { nombre: "María", dni_cuit: "20-12345678-9" },
    });
    usuario = await prisma.usuario.create({
      data: { email: "test@test.com", password_hash: "x", rol: "ADMIN" },
    });
  });

  test("trazabilidad completa del ejemplo del spec: deuda vieja + sobrante correctamente distinguidos", async () => {
    const contrato = await ContratosService.crear({
      id_propiedad: propiedad.id,
      id_inquilino: inquilino.id,
      fecha_inicio: "2026-01-01",
      fecha_fin: "2026-12-31",
      monto_base: 600000,
      pct_comision: 10,
      pct_punitorio_diario: 0.1,
    });
    await ContratosService.activar(contrato.id, usuario.id); // Agosto

    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 400000,
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });
    await ContratosService.avanzarPeriodo(contrato.id, "2026-09", new Date("2026-10-10"), usuario.id);

    const t2 = await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 900000,
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });
    assert.equal(t2.saldo_sobrante, "100000.00");

    await ContratosService.avanzarPeriodo(contrato.id, "2026-10", new Date("2026-11-10"), usuario.id);

    const cargoOctubre = await prisma.cargo.findFirst({
      where: { id_contrato: contrato.id, periodo: { periodo: "2026-10" } },
      include: { aplicaciones: true },
    });
    assert.equal(calcularPendiente(cargoOctubre!.monto, cargoOctubre!.aplicaciones).toNumber(), 500000);

    const saldo = await InquilinosService.obtenerSaldo(inquilino.id);
    assert.equal(saldo.deuda_alquiler, 500000); // solo Octubre — Agosto y Septiembre ya están en $0
  });
});
