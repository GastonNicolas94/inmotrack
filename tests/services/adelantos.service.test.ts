import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import { AdelantosService } from "@/services/adelantos.service";
import { Decimal } from "@prisma/client/runtime/client";

describe("AdelantosService.registrar", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("crea una Transaccion con tipo EGRESO_ADELANTO, caja TERCEROS, monto negativo, e id_propietario correcto", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Propietario 1", cbu: "0000000000000000000000" },
    });
    const usuario = await prisma.usuario.create({
      data: { email: "admin1@test.com", password_hash: "x", rol: "ADMIN" },
    });

    const adelanto = await AdelantosService.registrar({
      id_propietario: propietario.id,
      monto: 10000,
      id_usuario_creador: usuario.id,
    });

    assert.equal(adelanto.tipo, "EGRESO_ADELANTO");
    assert.equal(adelanto.caja_destino, "TERCEROS");
    assert.equal(Number(adelanto.monto), -10000);
    assert.equal(adelanto.id_propietario, propietario.id);
  });

  it("rechaza si el monto es 0 o negativo", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Propietario 2", cbu: "0000000000000000000000" },
    });
    const usuario = await prisma.usuario.create({
      data: { email: "admin2@test.com", password_hash: "x", rol: "ADMIN" },
    });

    await assert.rejects(
      AdelantosService.registrar({
        id_propietario: propietario.id,
        monto: 0,
        id_usuario_creador: usuario.id,
      })
    );

    await assert.rejects(
      AdelantosService.registrar({
        id_propietario: propietario.id,
        monto: -5000,
        id_usuario_creador: usuario.id,
      })
    );
  });
});

describe("AdelantosService.obtenerPendiente", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("devuelve { total: 0, detalle: [] } para un propietario sin adelantos", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Propietario 3", cbu: "0000000000000000000000" },
    });

    const resultado = await AdelantosService.obtenerPendiente(propietario.id);

    assert.equal(Number(resultado.total), 0);
    assert.equal(resultado.detalle.length, 0);
  });

  it("devuelve total = 10000 y detalle con 1 elemento de pendiente = 10000 después de registrar un adelanto de $10000 sin deducción", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Propietario 4", cbu: "0000000000000000000000" },
    });
    const usuario = await prisma.usuario.create({
      data: { email: "admin4@test.com", password_hash: "x", rol: "ADMIN" },
    });

    const adelanto = await AdelantosService.registrar({
      id_propietario: propietario.id,
      monto: 10000,
      id_usuario_creador: usuario.id,
    });

    const resultado = await AdelantosService.obtenerPendiente(propietario.id);

    assert.equal(Number(resultado.total), 10000);
    assert.equal(resultado.detalle.length, 1);
    assert.equal(resultado.detalle[0].id_transaccion, adelanto.id);
    assert.equal(Number(resultado.detalle[0].pendiente), 10000);
  });

  it("devuelve pendiente = 6000 después de crear una DeduccionAdelanto de $4000 sobre un adelanto de $10000", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Propietario 5", cbu: "0000000000000000000000" },
    });
    const usuario = await prisma.usuario.create({
      data: { email: "admin5@test.com", password_hash: "x", rol: "ADMIN" },
    });

    const adelanto = await AdelantosService.registrar({
      id_propietario: propietario.id,
      monto: 10000,
      id_usuario_creador: usuario.id,
    });

    // Crear una liquidación dummy para poder crear la deducción
    const liquidacion = await prisma.liquidacion.create({
      data: {
        id_propietario: propietario.id,
        fecha_desde: new Date("2026-08-01"),
        fecha_hasta: new Date("2026-08-31"),
        monto_bruto: new Decimal(0),
        retenciones: new Decimal(0),
        monto_neto: new Decimal(0),
      },
    });

    // Crear la deducción
    await prisma.deduccionAdelanto.create({
      data: {
        id_transaccion: adelanto.id,
        id_liquidacion: liquidacion.id,
        monto_descontado: new Decimal(4000),
      },
    });

    const resultado = await AdelantosService.obtenerPendiente(propietario.id);

    assert.equal(Number(resultado.total), 6000);
    assert.equal(resultado.detalle.length, 1);
    assert.equal(Number(resultado.detalle[0].pendiente), 6000);
  });

  it("devuelve adelantos en orden de antigüedad y excluye adelantos completamente descontados", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Propietario 6", cbu: "0000000000000000000000" },
    });
    const usuario = await prisma.usuario.create({
      data: { email: "admin6@test.com", password_hash: "x", rol: "ADMIN" },
    });

    // Crear primer adelanto (viejo)
    const adelanto1 = await prisma.transaccion.create({
      data: {
        tipo: "EGRESO_ADELANTO",
        caja_destino: "TERCEROS",
        monto: new Decimal(-5000),
        id_propietario: propietario.id,
        id_usuario_creador: usuario.id,
        fecha_transaccion: new Date("2026-01-01"),
      },
    });

    // Crear segundo adelanto (más nuevo)
    const adelanto2 = await AdelantosService.registrar({
      id_propietario: propietario.id,
      monto: 8000,
      id_usuario_creador: usuario.id,
    });

    // Crear una liquidación dummy
    const liquidacion = await prisma.liquidacion.create({
      data: {
        id_propietario: propietario.id,
        fecha_desde: new Date("2026-08-01"),
        fecha_hasta: new Date("2026-08-31"),
        monto_bruto: new Decimal(0),
        retenciones: new Decimal(0),
        monto_neto: new Decimal(0),
      },
    });

    // Descontar completamente el primer adelanto
    await prisma.deduccionAdelanto.create({
      data: {
        id_transaccion: adelanto1.id,
        id_liquidacion: liquidacion.id,
        monto_descontado: new Decimal(5000),
      },
    });

    const resultado = await AdelantosService.obtenerPendiente(propietario.id);

    // Solo debe aparecer el segundo adelanto (el primero tiene pendiente = 0)
    assert.equal(Number(resultado.total), 8000);
    assert.equal(resultado.detalle.length, 1);
    assert.equal(resultado.detalle[0].id_transaccion, adelanto2.id);
    assert.equal(Number(resultado.detalle[0].pendiente), 8000);
  });
});
