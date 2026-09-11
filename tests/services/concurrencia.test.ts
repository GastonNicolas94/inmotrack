import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import { calcularPendiente } from "@/lib/saldos";
import { PagosService } from "@/services/pagos.service";
import { LiquidacionesService } from "@/services/liquidaciones.service";

describe("Concurrencia y casos multi-entidad", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("dos pagos simultáneos al mismo contrato no pierden ninguna aplicación (el lock serializa)", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle 1", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino", dni_cuit: "20111111111" },
    });
    const usuario = await prisma.usuario.create({
      data: { email: "concurrencia1@test.com", auth_user_id: "00000000-0000-4000-8000-000000000501", rol: "ADMIN" },
    });
    const contrato = await prisma.contrato.create({
      data: {
        id_propiedad: propiedad.id,
        id_inquilino: inquilino.id,
        fecha_inicio: new Date("2026-01-01"),
        fecha_fin: new Date("2026-12-31"),
        estado: "ACTIVO",
        monto_base: 100000,
        pct_comision: 10,
      },
    });
    const periodo = await prisma.periodoPago.create({
      data: {
        id_contrato: contrato.id,
        periodo: "2026-08",
        fecha_vencimiento: new Date("2026-08-10"),
        estado_ciclo: "ABIERTO",
      },
    });
    const cargoAlquiler = await prisma.cargo.create({
      data: {
        id_periodo: periodo.id,
        id_contrato: contrato.id,
        tipo: "ALQUILER",
        monto: 100000,
      },
    });

    await Promise.all([
      PagosService.registrar({
        id_contrato: contrato.id,
        monto_pagado: 50000,
        idempotency_key: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        id_usuario_creador: usuario.id,
      }),
      PagosService.registrar({
        id_contrato: contrato.id,
        monto_pagado: 50000,
        idempotency_key: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        id_usuario_creador: usuario.id,
      }),
    ]);

    const cargoActualizado = await prisma.cargo.findUniqueOrThrow({
      where: { id: cargoAlquiler.id },
      include: { aplicaciones: true },
    });
    assert.equal(calcularPendiente(cargoActualizado.monto, cargoActualizado.aplicaciones).toNumber(), 0);
    assert.equal(cargoActualizado.aplicaciones.length, 2); // ninguna de las dos aplicaciones concurrentes se perdió
  });

  it("dos generaciones simultáneas de liquidación para el mismo propietario no duplican el dinero liquidado", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño 2", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle 2", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino 2", dni_cuit: "20222222222" },
    });
    const usuario = await prisma.usuario.create({
      data: { email: "concurrencia2@test.com", auth_user_id: "00000000-0000-4000-8000-000000000502", rol: "ADMIN" },
    });
    const contrato = await prisma.contrato.create({
      data: {
        id_propiedad: propiedad.id,
        id_inquilino: inquilino.id,
        fecha_inicio: new Date("2026-01-01"),
        fecha_fin: new Date("2026-12-31"),
        estado: "ACTIVO",
        monto_base: 100000,
        pct_comision: 10,
      },
    });
    const periodo = await prisma.periodoPago.create({
      data: {
        id_contrato: contrato.id,
        periodo: "2026-08",
        fecha_vencimiento: new Date("2026-08-10"),
        estado_ciclo: "ABIERTO",
      },
    });
    await prisma.cargo.create({
      data: {
        id_periodo: periodo.id,
        id_contrato: contrato.id,
        tipo: "ALQUILER",
        monto: 100000,
      },
    });
    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 100000,
      idempotency_key: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      id_usuario_creador: usuario.id,
    });

    // hasta = mañana: cubre con margen el pago recién registrado (fecha_transaccion = now() real).
    const hasta = new Date();
    hasta.setUTCDate(hasta.getUTCDate() + 1);

    const [liq1, liq2] = await Promise.all([
      LiquidacionesService.generarParaPropietario(propietario.id, hasta),
      LiquidacionesService.generarParaPropietario(propietario.id, hasta),
    ]);

    const totalBruto = Number(liq1.monto_bruto) + Number(liq2.monto_bruto);
    assert.equal(totalBruto, 100000); // ni se duplicó ni se perdió
    const conBruto = [liq1, liq2].filter((l) => Number(l.monto_bruto) > 0);
    assert.equal(conBruto.length, 1); // solo una de las dos corridas efectivamente liquidó algo
  });

  it("agrupa correctamente 2 contratos distintos de un mismo propietario en una sola liquidación", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño 3", cbu: "0000000000000000000000" },
    });
    const propiedadA = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle A", es_propia: false },
    });
    const propiedadB = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle B", es_propia: false },
    });
    const inquilinoA = await prisma.inquilino.create({
      data: { nombre: "Inquilino A", dni_cuit: "20333333333" },
    });
    const inquilinoB = await prisma.inquilino.create({
      data: { nombre: "Inquilino B", dni_cuit: "20444444444" },
    });
    const usuario = await prisma.usuario.create({
      data: { email: "concurrencia3@test.com", auth_user_id: "00000000-0000-4000-8000-000000000503", rol: "ADMIN" },
    });
    const contratoA = await prisma.contrato.create({
      data: {
        id_propiedad: propiedadA.id,
        id_inquilino: inquilinoA.id,
        fecha_inicio: new Date("2026-01-01"),
        fecha_fin: new Date("2026-12-31"),
        estado: "ACTIVO",
        monto_base: 100000,
        pct_comision: 10,
      },
    });
    const contratoB = await prisma.contrato.create({
      data: {
        id_propiedad: propiedadB.id,
        id_inquilino: inquilinoB.id,
        fecha_inicio: new Date("2026-01-01"),
        fecha_fin: new Date("2026-12-31"),
        estado: "ACTIVO",
        monto_base: 50000,
        pct_comision: 20,
      },
    });
    const periodoA = await prisma.periodoPago.create({
      data: {
        id_contrato: contratoA.id,
        periodo: "2026-08",
        fecha_vencimiento: new Date("2026-08-10"),
        estado_ciclo: "ABIERTO",
      },
    });
    const periodoB = await prisma.periodoPago.create({
      data: {
        id_contrato: contratoB.id,
        periodo: "2026-08",
        fecha_vencimiento: new Date("2026-08-10"),
        estado_ciclo: "ABIERTO",
      },
    });
    await prisma.cargo.create({
      data: { id_periodo: periodoA.id, id_contrato: contratoA.id, tipo: "ALQUILER", monto: 100000 },
    });
    await prisma.cargo.create({
      data: { id_periodo: periodoB.id, id_contrato: contratoB.id, tipo: "ALQUILER", monto: 50000 },
    });

    await PagosService.registrar({
      id_contrato: contratoA.id,
      monto_pagado: 100000,
      idempotency_key: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      id_usuario_creador: usuario.id,
    });
    await PagosService.registrar({
      id_contrato: contratoB.id,
      monto_pagado: 50000,
      idempotency_key: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      id_usuario_creador: usuario.id,
    });

    // hasta = mañana: cubre con margen ambos pagos recién registrados.
    const hasta = new Date();
    hasta.setUTCDate(hasta.getUTCDate() + 1);

    const liquidacion = await LiquidacionesService.generarParaPropietario(propietario.id, hasta);

    assert.equal(liquidacion.items.length, 2);
    assert.equal(Number(liquidacion.monto_bruto), 150000);
    // A: bruto 100000, comisión 10% = 10000; B: bruto 50000, comisión 20% = 10000. Retenciones = 20000.
    assert.equal(Number(liquidacion.retenciones), 20000);
    assert.equal(Number(liquidacion.monto_neto), 130000);

    // LiquidacionItem ya no tiene id_contrato (grano nuevo: id_periodo/id_propiedad) —
    // se matchea por id_propiedad, que en este test es 1:1 con cada contrato.
    const itemA = liquidacion.items.find((i) => i.id_propiedad === propiedadA.id)!;
    const itemB = liquidacion.items.find((i) => i.id_propiedad === propiedadB.id)!;
    assert.equal(Number(itemA.comision), 10000);
    assert.equal(Number(itemB.comision), 10000);
  });

  it("un contrato MOROSO vuelve a ACTIVO cuando el pago reduce los períodos vencidos a menos de 2", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño 4", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle 4", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino 4", dni_cuit: "20555555555" },
    });
    const usuario = await prisma.usuario.create({
      data: { email: "concurrencia4@test.com", auth_user_id: "00000000-0000-4000-8000-000000000504", rol: "ADMIN" },
    });
    const contrato = await prisma.contrato.create({
      data: {
        id_propiedad: propiedad.id,
        id_inquilino: inquilino.id,
        fecha_inicio: new Date("2026-01-01"),
        fecha_fin: new Date("2026-12-31"),
        estado: "MOROSO",
        monto_base: 100000,
        pct_comision: 10,
      },
    });
    const periodoVencido1 = await prisma.periodoPago.create({
      data: {
        id_contrato: contrato.id,
        periodo: "2026-06",
        fecha_vencimiento: new Date("2026-06-10"),
        estado_ciclo: "CERRADO",
      },
    });
    const periodoVencido2 = await prisma.periodoPago.create({
      data: {
        id_contrato: contrato.id,
        periodo: "2026-07",
        fecha_vencimiento: new Date("2026-07-10"),
        estado_ciclo: "CERRADO",
      },
    });
    const cargoVencido1 = await prisma.cargo.create({
      data: { id_periodo: periodoVencido1.id, id_contrato: contrato.id, tipo: "ALQUILER", monto: 100000 },
    });
    await prisma.cargo.create({
      data: { id_periodo: periodoVencido2.id, id_contrato: contrato.id, tipo: "ALQUILER", monto: 100000 },
    });

    // Prelación cubre el Cargo más antiguo (junio) primero. Después de este pago
    // solo julio sigue con deuda vencida (1 < 2) -> el contrato vuelve a ACTIVO.
    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 100000,
      idempotency_key: "ffffffff-ffff-ffff-ffff-ffffffffffff",
      id_usuario_creador: usuario.id,
    });

    const contratoActualizado = await prisma.contrato.findUniqueOrThrow({ where: { id: contrato.id } });
    assert.equal(contratoActualizado.estado, "ACTIVO");

    const cargo1Actualizado = await prisma.cargo.findUniqueOrThrow({
      where: { id: cargoVencido1.id },
      include: { aplicaciones: true },
    });
    assert.equal(calcularPendiente(cargo1Actualizado.monto, cargo1Actualizado.aplicaciones).toNumber(), 0);
  });
});
