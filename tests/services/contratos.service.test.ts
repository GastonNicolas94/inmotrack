import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import { ContratosService } from "@/services/contratos.service";
import { GastosService } from "@/services/gastos.service";
import { PagosService } from "@/services/pagos.service";
import { calcularPendiente } from "@/lib/saldos";
import { hoyEnArgentina } from "@/lib/fecha";

describe("ContratosService.obtenerPorId", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("incluye los gastos pendientes del contrato", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle 1", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino", dni_cuit: "20111111111" },
    });
    const contrato = await prisma.contrato.create({
      data: {
        id_propiedad: propiedad.id,
        id_inquilino: inquilino.id,
        fecha_inicio: new Date("2026-01-01"),
        fecha_fin: new Date("2026-12-31"),
        monto_base: 100000,
        pct_comision: 10,
      },
    });
    await GastosService.crear({
      id_propiedad: propiedad.id,
      id_contrato: contrato.id,
      concepto: "Arreglo pendiente",
      monto: 5000,
      tipo: "ARREGLO",
      cargo_a: "PROPIETARIO",
    });

    const resultado = await ContratosService.obtenerPorId(contrato.id);

    assert.equal(resultado?.gastos.length, 1);
    assert.equal(resultado?.gastos[0].estado_pago, "PENDIENTE");
  });
});

describe("ContratosService.activar", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("activar un contrato en BORRADOR genera el período con un Cargo ALQUILER, sin crédito heredado", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle 1", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino", dni_cuit: "20111111111" },
    });

    const contrato = await ContratosService.crear({
      id_propiedad: propiedad.id,
      id_inquilino: inquilino.id,
      fecha_inicio: "2026-01-01",
      fecha_fin: "2026-12-31",
      monto_base: 500000,
      pct_comision: 10,
      pct_punitorio_diario: 0.1,
    });

    await ContratosService.activar(contrato.id);

    const periodo = await prisma.periodoPago.findFirst({
      where: { id_contrato: contrato.id },
      include: { cargos: { include: { aplicaciones: true } } },
    });

    assert.equal(periodo?.estado_ciclo, "ABIERTO");
    assert.equal(Number(periodo?.credito_heredado), 0);
    assert.equal(periodo?.cargos.length, 1);
    assert.equal(periodo?.cargos[0].tipo, "ALQUILER");
    assert.equal(calcularPendiente(periodo!.cargos[0].monto, periodo!.cargos[0].aplicaciones).toNumber(), 500000);
  });

  it("con cobra_confeccion y estrategia UN_ALQUILER, genera un Cargo GASTO por el valor de un alquiler", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño Confección 1", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle Confección 1", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino Confección 1", dni_cuit: "20333333331" },
    });

    const contrato = await ContratosService.crear({
      id_propiedad: propiedad.id,
      id_inquilino: inquilino.id,
      fecha_inicio: "2026-08-01",
      fecha_fin: "2027-07-31",
      monto_base: 380000,
      pct_comision: 8,
      pct_punitorio_diario: 0.1,
      cobra_confeccion: true,
      estrategia_confeccion: "UN_ALQUILER",
    });

    await ContratosService.activar(contrato.id);

    const cargoConfeccion = await prisma.cargo.findFirst({
      where: { id_contrato: contrato.id, tipo: "GASTO" },
      include: { aplicaciones: true, gasto: true },
    });
    assert.ok(cargoConfeccion, "debe existir un Cargo GASTO de confección");
    assert.equal(cargoConfeccion!.gasto?.tipo, "CONFECCION_CONTRATO");
    assert.equal(cargoConfeccion!.gasto?.cargo_a, "INQUILINO");
    assert.equal(calcularPendiente(cargoConfeccion!.monto, cargoConfeccion!.aplicaciones).toNumber(), 380000);
  });

  it("con cobra_confeccion y estrategia PORCENTAJE_5, genera un Cargo GASTO por el 5% del contrato total", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño Confección 2", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle Confección 2", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino Confección 2", dni_cuit: "20333333332" },
    });

    const contrato = await ContratosService.crear({
      id_propiedad: propiedad.id,
      id_inquilino: inquilino.id,
      fecha_inicio: "2026-08-01",
      fecha_fin: "2028-07-31", // 24 meses
      monto_base: 380000,
      pct_comision: 8,
      pct_punitorio_diario: 0.1,
      cobra_confeccion: true,
      estrategia_confeccion: "PORCENTAJE_5",
    });

    await ContratosService.activar(contrato.id);

    const cargoConfeccion = await prisma.cargo.findFirst({
      where: { id_contrato: contrato.id, tipo: "GASTO" },
      include: { aplicaciones: true },
    });
    // 380000 * 24 meses * 0.05 = 456000
    assert.equal(calcularPendiente(cargoConfeccion!.monto, cargoConfeccion!.aplicaciones).toNumber(), 456000);
  });

  it("sin cobra_confeccion, no genera ningún Cargo GASTO", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño Confección 3", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle Confección 3", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino Confección 3", dni_cuit: "20333333333" },
    });

    const contrato = await ContratosService.crear({
      id_propiedad: propiedad.id,
      id_inquilino: inquilino.id,
      fecha_inicio: "2026-08-01",
      fecha_fin: "2027-07-31",
      monto_base: 380000,
      pct_comision: 8,
      pct_punitorio_diario: 0.1,
    });

    await ContratosService.activar(contrato.id);

    const cargoConfeccion = await prisma.cargo.findFirst({
      where: { id_contrato: contrato.id, tipo: "GASTO" },
    });
    assert.equal(cargoConfeccion, null);
  });

  it("el vencimiento del primer período es del MISMO mes de fecha_inicio, no el mes siguiente", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño Vencimiento", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle Vencimiento", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino Vencimiento", dni_cuit: "20555555555" },
    });

    const contrato = await ContratosService.crear({
      id_propiedad: propiedad.id,
      id_inquilino: inquilino.id,
      fecha_inicio: "2026-09-01",
      fecha_fin: "2027-08-31",
      monto_base: 300000,
      pct_comision: 10,
      pct_punitorio_diario: 0.1,
    });
    await ContratosService.activar(contrato.id);

    const periodo = await prisma.periodoPago.findFirst({ where: { id_contrato: contrato.id } });
    assert.equal(periodo?.periodo, "2026-09");
    // Antes del fix, esto daba "2026-10-10" (un mes después).
    assert.equal(periodo?.fecha_vencimiento.toISOString().slice(0, 10), "2026-09-10");
  });
});

describe("ContratosService.avanzarPeriodo", () => {
  let propiedad: { id: number };
  let inquilino: { id: number };
  let usuario: { id: number };

  beforeEach(async () => {
    await cleanDatabase();
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño", cbu: "0000000000000000000000" },
    });
    propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle 1", es_propia: false },
    });
    inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino", dni_cuit: "20111111111" },
    });
    usuario = await prisma.usuario.create({
      data: { email: "admin@test.com", auth_user_id: "00000000-0000-4000-8000-000000000201", rol: "ADMIN" },
    });
  });

  it("sin sobrante, el período cierra con credito_al_cierre=0 y el siguiente nace sin herencia", async () => {
    const contrato = await ContratosService.crear({
      id_propiedad: propiedad.id,
      id_inquilino: inquilino.id,
      fecha_inicio: "2026-01-01",
      fecha_fin: "2026-12-31",
      monto_base: 600000,
      pct_comision: 10,
      pct_punitorio_diario: 0.1,
    });
    await ContratosService.activar(contrato.id);
    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 400000, // deja $200.000 pendientes, sin sobrante
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });

    const agosto = await prisma.periodoPago.findFirst({ where: { id_contrato: contrato.id } });
    await ContratosService.avanzarPeriodo(contrato.id, "2026-09", new Date("2026-10-10"));

    const agostoCerrado = await prisma.periodoPago.findUnique({ where: { id: agosto!.id } });
    assert.equal(agostoCerrado?.estado_ciclo, "CERRADO");
    assert.equal(Number(agostoCerrado?.credito_al_cierre), 0);

    const septiembre = await prisma.periodoPago.findFirst({ where: { id_contrato: contrato.id, periodo: "2026-09" } });
    assert.equal(Number(septiembre?.credito_heredado), 0);

    // El Cargo de agosto sigue con su deuda, sin tocar, sin importar que cerró.
    const cargoAgosto = await prisma.cargo.findFirst({
      where: { id_periodo: agosto!.id },
      include: { aplicaciones: true },
    });
    assert.equal(calcularPendiente(cargoAgosto!.monto, cargoAgosto!.aplicaciones).toNumber(), 200000);
  });

  it("con sobrante, el crédito se arrastra y se aplica con su comisión al abrir el siguiente", async () => {
    const contrato = await ContratosService.crear({
      id_propiedad: propiedad.id,
      id_inquilino: inquilino.id,
      fecha_inicio: "2026-08-01", // activar() genera el período a partir de esta fecha
      fecha_fin: "2026-12-31",
      monto_base: 600000,
      pct_comision: 10,
      pct_punitorio_diario: 0.1,
    });
    await ContratosService.activar(contrato.id);
    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 700000, // 600k al alquiler + 100k de sobrante
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });

    await ContratosService.avanzarPeriodo(contrato.id, "2026-09", new Date("2026-10-10"));

    const agosto = await prisma.periodoPago.findFirst({ where: { id_contrato: contrato.id, periodo: "2026-08" } });
    assert.equal(Number(agosto?.credito_al_cierre), 100000);

    const septiembre = await prisma.periodoPago.findFirst({
      where: { id_contrato: contrato.id, periodo: "2026-09" },
      include: { cargos: { include: { aplicaciones: true } } },
    });
    assert.equal(Number(septiembre?.credito_heredado), 100000);
    const pendienteSeptiembre = calcularPendiente(septiembre!.cargos[0].monto, septiembre!.cargos[0].aplicaciones);
    assert.equal(pendienteSeptiembre.toNumber(), 500000); // 600k - 100k arrastrado

    const totalComisiones = await prisma.transaccion.aggregate({
      where: { id_contrato: contrato.id, tipo: "INGRESO_COMISION" },
      _sum: { monto: true },
    });
    assert.equal(Number(totalComisiones._sum.monto), 70000); // 60k (agosto) + 10k (arrastre)
  });

  it("un pago que cubre deuda de un período viejo Y sobra, arrastra solo lo que realmente sobró", async () => {
    // Reproduce el ejemplo 4.1 completo del spec: Cargo #1 (Agosto, $200k
    // pendiente) + Cargo #2 (Septiembre, $600k) cobrados con un solo pago de
    // $900.000 — $100.000 de sobrante real, no $300.000 (que sería el error
    // de comparar totales agregados en vez de por transacción).
    const contrato = await ContratosService.crear({
      id_propiedad: propiedad.id,
      id_inquilino: inquilino.id,
      fecha_inicio: "2026-08-01", // activar() genera el período a partir de esta fecha
      fecha_fin: "2026-12-31",
      monto_base: 600000,
      pct_comision: 10,
      pct_punitorio_diario: 0.1,
    });
    await ContratosService.activar(contrato.id); // Agosto
    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 400000, // Agosto queda con $200.000 pendientes
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });
    await ContratosService.avanzarPeriodo(contrato.id, "2026-09", new Date("2026-10-10")); // cierra Agosto (credito_al_cierre=0), abre Septiembre

    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 900000, // 200k a Agosto (el más viejo) + 600k a Septiembre + 100k sobrante
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });

    await ContratosService.avanzarPeriodo(contrato.id, "2026-10", new Date("2026-11-10")); // cierra Septiembre

    const septiembre = await prisma.periodoPago.findFirst({ where: { id_contrato: contrato.id, periodo: "2026-09" } });
    assert.equal(Number(septiembre?.credito_al_cierre), 100000); // NO 300000

    const cargoAgosto = await prisma.cargo.findFirst({
      where: { id_contrato: contrato.id, periodo: { periodo: "2026-08" } },
      include: { aplicaciones: true },
    });
    assert.equal(calcularPendiente(cargoAgosto!.monto, cargoAgosto!.aplicaciones).toNumber(), 0); // se cobró bien
  });
});

describe("ContratosService.marcarContratosPorVencer", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  async function crearContrato(estado: string, fechaFin: Date) {
    const propietario = await prisma.propietario.create({
      data: { nombre: `Dueño ${Math.random()}`, cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: `Calle ${Math.random()}`, es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: `Inquilino ${Math.random()}`, dni_cuit: `20${Math.floor(Math.random() * 1e9)}` },
    });
    return prisma.contrato.create({
      data: {
        id_propiedad: propiedad.id,
        id_inquilino: inquilino.id,
        fecha_inicio: new Date("2020-01-01"),
        fecha_fin: fechaFin,
        monto_base: 300000,
        pct_comision: 10,
        estado: estado as never,
      },
    });
  }

  // Fechas relativas a hoyEnArgentina() a propósito, sin años hardcodeados
  // — así el test no se rompe con el paso del tiempo real (ver TODO.md,
  // "time bomb" señalada en otros tests de este mismo plan).
  function fechaEnMeses(mesesDesdeHoy: number, diasExtra = 0): Date {
    const { anio, mes, dia } = hoyEnArgentina();
    return new Date(Date.UTC(anio, mes - 1 + mesesDesdeHoy, dia + diasExtra));
  }

  it("pasa a POR_VENCER un contrato ACTIVO cuya fecha_fin cae dentro de los próximos 3 meses", async () => {
    const contrato = await crearContrato("ACTIVO", fechaEnMeses(2));

    const { marcados } = await ContratosService.marcarContratosPorVencer();

    assert.equal(marcados, 1);
    const actualizado = await prisma.contrato.findUnique({ where: { id: contrato.id } });
    assert.equal(actualizado?.estado, "POR_VENCER");
  });

  it("no toca un contrato ACTIVO cuya fecha_fin está más allá de 3 meses", async () => {
    const contrato = await crearContrato("ACTIVO", fechaEnMeses(4));

    const { marcados } = await ContratosService.marcarContratosPorVencer();

    assert.equal(marcados, 0);
    const actualizado = await prisma.contrato.findUnique({ where: { id: contrato.id } });
    assert.equal(actualizado?.estado, "ACTIVO");
  });

  it("no toca un contrato MOROSO aunque su fecha_fin esté dentro de los próximos 3 meses", async () => {
    const contrato = await crearContrato("MOROSO", fechaEnMeses(1));

    const { marcados } = await ContratosService.marcarContratosPorVencer();

    assert.equal(marcados, 0);
    const actualizado = await prisma.contrato.findUnique({ where: { id: contrato.id } });
    assert.equal(actualizado?.estado, "MOROSO");
  });

  it("incluye el borde exacto de 3 meses", async () => {
    await crearContrato("ACTIVO", fechaEnMeses(3));

    const { marcados } = await ContratosService.marcarContratosPorVencer();

    assert.equal(marcados, 1);
  });

  it("no toca un contrato cuya fecha_fin ya pasó (eso lo maneja el cierre de períodos, no esto)", async () => {
    const contrato = await crearContrato("ACTIVO", fechaEnMeses(0, -5));

    const { marcados } = await ContratosService.marcarContratosPorVencer();

    assert.equal(marcados, 0);
    const actualizado = await prisma.contrato.findUnique({ where: { id: contrato.id } });
    assert.equal(actualizado?.estado, "ACTIVO");
  });
});
