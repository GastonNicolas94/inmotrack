import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "@prisma/client/runtime/client";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import { InquilinosService } from "@/services/inquilinos.service";
import { ContratosService } from "@/services/contratos.service";

describe("InquilinosService.obtenerSaldo", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("incluye deuda de alquiler, punitorios pendientes y gastos a cargo del inquilino", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle 1", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino", dni_cuit: "20111111111" },
    });

    // Crear contrato y activarlo para que genere PeriodoPago y Cargo de ALQUILER
    const contrato = await ContratosService.crear({
      id_propiedad: propiedad.id,
      id_inquilino: inquilino.id,
      fecha_inicio: "2026-01-01",
      fecha_fin: "2026-12-31",
      monto_base: new Decimal(100000),
      pct_comision: new Decimal(10),
    });
    await ContratosService.activar(contrato.id);

    // Obtener el cargo de ALQUILER creado por activar()
    const cargoAlquiler = await prisma.cargo.findFirst({
      where: { id_contrato: contrato.id, tipo: "ALQUILER" },
    });
    assert(cargoAlquiler, "Cargo de ALQUILER debe existir después de activar");

    // Crear un pago (Transaccion) de 40000
    const transaccion = await prisma.transaccion.create({
      data: {
        tipo: "INGRESO_COBRO",
        caja_destino: "TERCEROS",
        monto: new Decimal(40000),
        id_contrato: contrato.id,
      },
    });

    // Aplicar el pago al cargo de ALQUILER
    await prisma.aplicacionPago.create({
      data: {
        id_transaccion: transaccion.id,
        id_cargo: cargoAlquiler.id,
        monto_aplicado: new Decimal(40000),
      },
    });

    // Crear un cargo de PUNITORIO pendiente de 3000
    const periodoPago = await prisma.periodoPago.findFirst({
      where: { id_contrato: contrato.id },
    });
    assert(periodoPago, "PeriodoPago debe existir después de activar");

    await prisma.cargo.create({
      data: {
        id_periodo: periodoPago.id,
        id_contrato: contrato.id,
        tipo: "PUNITORIO",
        monto: new Decimal(3000),
      },
    });

    // Crear un gasto a cargo del inquilino
    await prisma.gasto.create({
      data: {
        id_propiedad: propiedad.id,
        id_contrato: contrato.id,
        concepto: "Arreglo",
        monto: new Decimal(5000),
        tipo: "ARREGLO",
        cargo_a: "INQUILINO",
      },
    });

    // Crear un cargo de tipo GASTO para el gasto anterior
    const gasto = await prisma.gasto.findFirst({
      where: { id_contrato: contrato.id },
    });
    assert(gasto, "Gasto debe existir");

    await prisma.cargo.create({
      data: {
        id_periodo: periodoPago.id,
        id_contrato: contrato.id,
        tipo: "GASTO",
        monto: new Decimal(5000),
        descripcion: "Arreglo",
        id_gasto: gasto.id,
      },
    });

    const saldo = await InquilinosService.obtenerSaldo(inquilino.id);

    assert.equal(saldo.deuda_alquiler, 60000);
    assert.equal(saldo.punitorios, 3000);
    assert.equal(saldo.deuda_gastos, 5000);
    assert.equal(saldo.total, 68000);
  });

  it("no incluye en detalle_periodos los cargos ya completamente cubiertos", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño 2", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle 2", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino 2", dni_cuit: "20222222222" },
    });

    const contrato = await ContratosService.crear({
      id_propiedad: propiedad.id,
      id_inquilino: inquilino.id,
      fecha_inicio: "2026-01-01",
      fecha_fin: "2026-12-31",
      monto_base: new Decimal(100000),
      pct_comision: new Decimal(10),
    });
    await ContratosService.activar(contrato.id);

    const periodoPago = await prisma.periodoPago.findFirst({
      where: { id_contrato: contrato.id },
    });
    assert(periodoPago, "PeriodoPago debe existir");

    // Obtener el cargo de ALQUILER creado por activar()
    const cargoAlquilerCreado = await prisma.cargo.findFirst({
      where: { id_contrato: contrato.id, tipo: "ALQUILER" },
    });
    assert(cargoAlquilerCreado, "Cargo de ALQUILER debe existir después de activar");

    // Este cargo será completamente cubierto
    const txnCubierta = await prisma.transaccion.create({
      data: {
        tipo: "INGRESO_COBRO",
        caja_destino: "TERCEROS",
        monto: new Decimal(100000),
        id_contrato: contrato.id,
      },
    });

    await prisma.aplicacionPago.create({
      data: {
        id_transaccion: txnCubierta.id,
        id_cargo: cargoAlquilerCreado.id,
        monto_aplicado: new Decimal(100000),
      },
    });

    // Crear un segundo cargo de ALQUILER pendiente (no cubierto)
    const cargoAlquilerPendiente = await prisma.cargo.create({
      data: {
        id_periodo: periodoPago.id,
        id_contrato: contrato.id,
        tipo: "ALQUILER",
        monto: new Decimal(100000),
      },
    });

    const saldo = await InquilinosService.obtenerSaldo(inquilino.id);

    assert.equal(saldo.detalle_periodos.length, 1);
    assert.equal(saldo.detalle_periodos[0].id, cargoAlquilerPendiente.id);
    assert.equal(saldo.deuda_alquiler, 100000);
  });

  it("suma deuda de múltiples contratos del mismo inquilino", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño 3", cbu: "0000000000000000000000" },
    });
    const propiedad1 = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle 3", es_propia: false },
    });
    const propiedad2 = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle 4", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino 3", dni_cuit: "20333333333" },
    });

    // Contrato 1
    const contrato1 = await ContratosService.crear({
      id_propiedad: propiedad1.id,
      id_inquilino: inquilino.id,
      fecha_inicio: "2026-01-01",
      fecha_fin: "2026-12-31",
      monto_base: new Decimal(50000),
      pct_comision: new Decimal(10),
    });
    await ContratosService.activar(contrato1.id);

    const periodo1 = await prisma.periodoPago.findFirst({
      where: { id_contrato: contrato1.id },
    });
    assert(periodo1, "PeriodoPago para contrato 1 debe existir");

    // Contrato 2
    const contrato2 = await ContratosService.crear({
      id_propiedad: propiedad2.id,
      id_inquilino: inquilino.id,
      fecha_inicio: "2026-01-01",
      fecha_fin: "2026-12-31",
      monto_base: new Decimal(75000),
      pct_comision: new Decimal(10),
    });
    await ContratosService.activar(contrato2.id);

    const periodo2 = await prisma.periodoPago.findFirst({
      where: { id_contrato: contrato2.id },
    });
    assert(periodo2, "PeriodoPago para contrato 2 debe existir");

    // Obtener los cargos creados por activar()
    const cargos1 = await prisma.cargo.findMany({
      where: { id_contrato: contrato1.id, tipo: "ALQUILER" },
    });
    const cargos2 = await prisma.cargo.findMany({
      where: { id_contrato: contrato2.id, tipo: "ALQUILER" },
    });

    // Cargo 1: 50000 totalmente pendiente
    // Cargo 2: 75000 totalmente pendiente

    const saldo = await InquilinosService.obtenerSaldo(inquilino.id);

    assert.equal(saldo.deuda_alquiler, 125000); // 50000 + 75000
    assert.equal(saldo.punitorios, 0);
    assert.equal(saldo.deuda_gastos, 0);
    assert.equal(saldo.total, 125000);
    assert.equal(saldo.detalle_periodos.length, 2); // Dos cargos de ALQUILER
  });
});
