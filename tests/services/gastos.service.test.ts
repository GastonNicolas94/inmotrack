import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import { GastosService } from "@/services/gastos.service";
import { ContratosService } from "@/services/contratos.service";
import { calcularPendiente } from "@/lib/saldos";

describe("GastosService.crear", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("crea un gasto de propiedad con cargo_a PROPIETARIO", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle 1", es_propia: false },
    });

    const gasto = await GastosService.crear({
      id_propiedad: propiedad.id,
      concepto: "Pintura de fachada",
      monto: 30000,
      tipo: "ARREGLO",
      cargo_a: "PROPIETARIO",
    });

    assert.equal(gasto.id_propiedad, propiedad.id);
    assert.equal(gasto.estado_pago, "PENDIENTE");
  });

  it("crea un gasto propio de la inmobiliaria sin propiedad", async () => {
    const gasto = await GastosService.crear({
      concepto: "Sueldo administrativo",
      categoria_interno: "Sueldos",
      monto: 500000,
      tipo: "OTRO",
      cargo_a: "INMOBILIARIA",
    });

    assert.equal(gasto.id_propiedad, null);
    assert.equal(gasto.categoria_interno, "Sueldos");
  });

  it("crear un gasto con id_contrato genera un Cargo GASTO en el período abierto", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle 1", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino", dni_cuit: "12345678", email: "inquilino@test.com" },
    });

    const contrato = await ContratosService.crear({
      id_propiedad: propiedad.id,
      id_inquilino: inquilino.id,
      fecha_inicio: "2026-01-01",
      fecha_fin: "2026-12-31",
      monto_base: 400000,
      pct_comision: 10,
      pct_punitorio_diario: 0.1,
    });
    await ContratosService.activar(contrato.id);

    const gasto = await GastosService.crear({
      id_propiedad: propiedad.id,
      id_contrato: contrato.id,
      concepto: "Expensas",
      monto: 30000,
      tipo: "EXPENSA",
      cargo_a: "PROPIETARIO",
    });

    const cargo = await prisma.cargo.findFirst({
      where: { id_gasto: gasto.id },
      include: { aplicaciones: true },
    });
    assert.equal(cargo?.tipo, "GASTO");
    assert.equal(calcularPendiente(cargo!.monto, cargo!.aplicaciones).toNumber(), 30000);
  });

  it("crear un gasto sin id_contrato (propio de la inmobiliaria) no genera ningún Cargo", async () => {
    const gasto = await GastosService.crear({
      concepto: "Sueldos",
      categoria_interno: "Sueldos",
      monto: 800000,
      tipo: "OTRO",
      cargo_a: "INMOBILIARIA",
    });

    const cargo = await prisma.cargo.findFirst({ where: { id_gasto: gasto.id } });
    assert.equal(cargo, null);
  });

  it("un gasto a cargo del inquilino consume crédito disponible al nacer, sin esperar al cierre del período", async () => {
    const { PagosService } = await import("@/services/pagos.service");
    const usuario = await prisma.usuario.create({
      data: { email: "credito1@test.com", password_hash: "x", rol: "ADMIN" },
    });
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño Crédito", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle Crédito 1", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino Crédito", dni_cuit: "20555555555" },
    });

    const contrato = await ContratosService.crear({
      id_propiedad: propiedad.id,
      id_inquilino: inquilino.id,
      fecha_inicio: "2026-01-01",
      fecha_fin: "2026-12-31",
      monto_base: 400000,
      pct_comision: 10,
      pct_punitorio_diario: 0.1,
    });
    await ContratosService.activar(contrato.id);
    // Paga de más: cubre los 400.000 de alquiler y deja 50.000 flotando.
    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 450000,
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });

    const gasto = await GastosService.crear({
      id_propiedad: propiedad.id,
      id_contrato: contrato.id,
      concepto: "Expensas",
      monto: 30000,
      tipo: "EXPENSA",
      cargo_a: "INQUILINO",
    });

    const cargo = await prisma.cargo.findFirstOrThrow({
      where: { id_gasto: gasto.id },
      include: { aplicaciones: true },
    });
    // Se consumió por completo con el crédito disponible, sin que nadie pague nada nuevo.
    assert.equal(calcularPendiente(cargo.monto, cargo.aplicaciones).toNumber(), 0);

    const txnCobro = await prisma.transaccion.findFirstOrThrow({
      where: { id_contrato: contrato.id, tipo: "INGRESO_COBRO" },
      include: { aplicaciones: true },
    });
    // Del sobrante de 50.000, quedan 20.000 todavía flotando para lo próximo.
    assert.equal(calcularPendiente(txnCobro.monto, txnCobro.aplicaciones).toNumber(), 20000);

    const comisiones = await prisma.transaccion.count({
      where: { id_contrato: contrato.id, tipo: { in: ["INGRESO_COMISION", "INGRESO_ALQUILER_PROPIO"] } },
    });
    // Solo la comisión del alquiler original — un GASTO nunca genera comisión.
    assert.equal(comisiones, 1);
  });

  it("un gasto a cargo del PROPIETARIO no consume el crédito disponible del inquilino", async () => {
    const { PagosService } = await import("@/services/pagos.service");
    const usuario = await prisma.usuario.create({
      data: { email: "credito2@test.com", password_hash: "x", rol: "ADMIN" },
    });
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño Crédito Propietario", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle Crédito 2", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino Crédito 2", dni_cuit: "20666666666" },
    });

    const contrato = await ContratosService.crear({
      id_propiedad: propiedad.id,
      id_inquilino: inquilino.id,
      fecha_inicio: "2026-01-01",
      fecha_fin: "2026-12-31",
      monto_base: 400000,
      pct_comision: 10,
      pct_punitorio_diario: 0.1,
    });
    await ContratosService.activar(contrato.id);
    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 450000,
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });

    const gasto = await GastosService.crear({
      id_propiedad: propiedad.id,
      id_contrato: contrato.id,
      concepto: "Expensas",
      monto: 30000,
      tipo: "EXPENSA",
      cargo_a: "PROPIETARIO",
    });

    const cargo = await prisma.cargo.findFirstOrThrow({
      where: { id_gasto: gasto.id },
      include: { aplicaciones: true },
    });
    // Queda con el pendiente completo — el crédito del inquilino no es suyo.
    assert.equal(calcularPendiente(cargo.monto, cargo.aplicaciones).toNumber(), 30000);
  });
});

describe("GastosService.marcarPagado", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("genera EGRESO_TERCEROS al pagar un gasto de propiedad", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle 1", es_propia: false },
    });
    const usuario = await prisma.usuario.create({
      data: { email: "admin2@test.com", password_hash: "x", rol: "ADMIN" },
    });
    const gasto = await GastosService.crear({
      id_propiedad: propiedad.id,
      concepto: "Plomero",
      monto: 15000,
      tipo: "ARREGLO",
      cargo_a: "PROPIETARIO",
    });

    await GastosService.marcarPagado(gasto.id, usuario.id);

    const actualizado = await prisma.gasto.findUniqueOrThrow({ where: { id: gasto.id } });
    assert.equal(actualizado.estado_pago, "PAGADO_PROVEEDOR");

    const txn = await prisma.transaccion.findFirstOrThrow({ where: { tipo: "EGRESO_TERCEROS" } });
    assert.equal(txn.caja_destino, "TERCEROS");
    assert.equal(Number(txn.monto), -15000);
  });

  it("genera EGRESO_OPERATIVO al pagar un gasto propio de la inmobiliaria", async () => {
    const usuario = await prisma.usuario.create({
      data: { email: "admin3@test.com", password_hash: "x", rol: "ADMIN" },
    });
    const gasto = await GastosService.crear({
      concepto: "Alquiler de oficina",
      monto: 200000,
      tipo: "OTRO",
      cargo_a: "INMOBILIARIA",
    });

    await GastosService.marcarPagado(gasto.id, usuario.id);

    const txn = await prisma.transaccion.findFirstOrThrow({ where: { tipo: "EGRESO_OPERATIVO" } });
    assert.equal(txn.caja_destino, "OPERATIVA");
    assert.equal(Number(txn.monto), -200000);
  });

  it("rechaza marcar como pagado un gasto que ya fue pagado", async () => {
    const usuario = await prisma.usuario.create({
      data: { email: "admin4@test.com", password_hash: "x", rol: "ADMIN" },
    });
    const gasto = await GastosService.crear({
      concepto: "Alquiler de oficina",
      monto: 200000,
      tipo: "OTRO",
      cargo_a: "INMOBILIARIA",
    });
    await GastosService.marcarPagado(gasto.id, usuario.id);

    await assert.rejects(GastosService.marcarPagado(gasto.id, usuario.id));
  });
});

describe("GastosService.listar", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("lista gastos de propiedad y gastos propios de la inmobiliaria juntos", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle 1", es_propia: false },
    });

    await GastosService.crear({
      id_propiedad: propiedad.id,
      concepto: "Arreglo",
      monto: 10000,
      tipo: "ARREGLO",
      cargo_a: "PROPIETARIO",
    });
    await GastosService.crear({
      concepto: "Sueldo",
      monto: 500000,
      tipo: "OTRO",
      cargo_a: "INMOBILIARIA",
    });

    const gastos = await GastosService.listar();

    assert.equal(gastos.length, 2);
  });
});
