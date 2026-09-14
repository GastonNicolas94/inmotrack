import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import { PagosService } from "@/services/pagos.service";
import { ContratosService } from "@/services/contratos.service";
import { calcularPendiente } from "@/lib/saldos";

async function crearEscenarioBasico({ conPunitorio = true }: { conPunitorio?: boolean } = {}) {
  const propietario = await prisma.propietario.create({
    data: { nombre: "Dueño Test", cbu: "0000000000000000000000" },
  });
  const propiedad = await prisma.propiedad.create({
    data: { id_propietario: propietario.id, direccion: "Calle Falsa 123", es_propia: false },
  });
  const inquilino = await prisma.inquilino.create({
    data: { nombre: "Inquilino Test", dni_cuit: "20111111111" },
  });
  const usuario = await prisma.usuario.create({
    data: { email: "admin@test.com", auth_user_id: "00000000-0000-4000-8000-000000000301", rol: "ADMIN" },
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
  const cargoPunitorio = conPunitorio
    ? await prisma.cargo.create({
        data: {
          id_periodo: periodo.id,
          id_contrato: contrato.id,
          tipo: "PUNITORIO",
          monto: 5000,
        },
      })
    : null;

  return { propietario, propiedad, inquilino, usuario, contrato, periodo, cargoAlquiler, cargoPunitorio };
}

describe("PagosService.registrar", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("aplica primero a punitorios, después a capital, y genera INGRESO_COMISION proporcional", async () => {
    const { contrato, cargoAlquiler, cargoPunitorio, usuario } = await crearEscenarioBasico();

    const resultado = await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 105000,
      idempotency_key: "11111111-1111-1111-1111-111111111111",
      id_usuario_creador: usuario.id,
    });

    assert.equal(resultado.procesado, true);
    assert.equal(resultado.aplicado_punitorios, "5000.00");
    assert.equal(resultado.aplicado_capital, "100000.00");
    assert.equal(resultado.saldo_sobrante, "0.00");

    const cargoAlquilerActualizado = await prisma.cargo.findUniqueOrThrow({
      where: { id: cargoAlquiler.id },
      include: { aplicaciones: true },
    });
    assert.equal(
      calcularPendiente(cargoAlquilerActualizado.monto, cargoAlquilerActualizado.aplicaciones).toNumber(),
      0
    );

    const cargoPunitorioActualizado = await prisma.cargo.findUniqueOrThrow({
      where: { id: cargoPunitorio!.id },
      include: { aplicaciones: true },
    });
    assert.equal(
      calcularPendiente(cargoPunitorioActualizado.monto, cargoPunitorioActualizado.aplicaciones).toNumber(),
      0
    );

    const aplicaciones = await prisma.aplicacionPago.findMany({
      where: { id_cargo: { in: [cargoAlquiler.id, cargoPunitorio!.id] } },
    });
    assert.equal(aplicaciones.length, 2);

    const transacciones = await prisma.transaccion.findMany({
      where: { id_contrato: contrato.id },
      orderBy: { tipo: "asc" },
    });
    const tipos = transacciones.map((t) => t.tipo).sort();
    // El punitorio es 100% de la inmobiliaria (motor de punitorios,
    // 2026-08-27) — genera su propia Transaccion OPERATIVA, igual que la
    // comisión, trazada hacia el cobro que la generó.
    assert.deepEqual(tipos, ["INGRESO_COBRO", "INGRESO_COMISION", "INGRESO_PUNITORIO"]);

    const comision = transacciones.find((t) => t.tipo === "INGRESO_COMISION")!;
    assert.equal(Number(comision.monto), 10000); // 10% de 100000
    assert.equal(comision.caja_destino, "OPERATIVA");

    const punitorio = transacciones.find((t) => t.tipo === "INGRESO_PUNITORIO")!;
    assert.equal(Number(punitorio.monto), 5000); // el abono completo aplicado al Cargo PUNITORIO
    assert.equal(punitorio.caja_destino, "OPERATIVA");
    assert.equal(punitorio.id_txn_origen, transacciones.find((t) => t.tipo === "INGRESO_COBRO")!.id);
  });

  it("genera INGRESO_ALQUILER_PROPIO en vez de INGRESO_COMISION cuando la propiedad es propia", async () => {
    const { propiedad, contrato, usuario } = await crearEscenarioBasico();
    await prisma.propiedad.update({ where: { id: propiedad.id }, data: { es_propia: true } });
    await prisma.contrato.update({ where: { id: contrato.id }, data: { pct_comision: 100 } });

    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 100000,
      idempotency_key: "22222222-2222-2222-2222-222222222222",
      id_usuario_creador: usuario.id,
    });

    const transacciones = await prisma.transaccion.findMany({ where: { id_contrato: contrato.id } });
    assert.equal(transacciones.some((t) => t.tipo === "INGRESO_ALQUILER_PROPIO"), true);
    assert.equal(transacciones.some((t) => t.tipo === "INGRESO_COMISION"), false);
  });

  it("rechaza un pago repetido con la misma idempotency_key", async () => {
    const { contrato, usuario } = await crearEscenarioBasico();
    const key = "33333333-3333-3333-3333-333333333333";

    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 1000,
      idempotency_key: key,
      id_usuario_creador: usuario.id,
    });

    await assert.rejects(
      PagosService.registrar({
        id_contrato: contrato.id,
        monto_pagado: 1000,
        idempotency_key: key,
        id_usuario_creador: usuario.id,
      })
    );
  });

  it("aplica el saldo restante a gastos a cargo del inquilino después de punitorios y capital", async () => {
    const { contrato, periodo, propiedad, usuario } = await crearEscenarioBasico({ conPunitorio: false });

    const gasto = await prisma.gasto.create({
      data: {
        id_propiedad: propiedad.id,
        id_contrato: contrato.id,
        concepto: "Arreglo de cañería",
        monto: 20000,
        tipo: "ARREGLO",
        cargo_a: "INQUILINO",
      },
    });
    const cargoGasto = await prisma.cargo.create({
      data: {
        id_periodo: periodo.id,
        id_contrato: contrato.id,
        tipo: "GASTO",
        monto: gasto.monto,
        id_gasto: gasto.id,
      },
    });

    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 110000, // 100000 capital + 10000 hacia el gasto
      idempotency_key: "44444444-4444-4444-4444-444444444444",
      id_usuario_creador: usuario.id,
    });

    const cargoGastoActualizado = await prisma.cargo.findUniqueOrThrow({
      where: { id: cargoGasto.id },
      include: { aplicaciones: true },
    });
    assert.equal(
      calcularPendiente(cargoGastoActualizado.monto, cargoGastoActualizado.aplicaciones).toNumber(),
      10000
    );

    const aplicacionGasto = cargoGastoActualizado.aplicaciones[0];
    assert.notEqual(aplicacionGasto, undefined);
    assert.equal(Number(aplicacionGasto.monto_aplicado), 10000);
  });

  it("un contrato MOROSO vuelve a ACTIVO cuando el pago reduce los períodos vencidos a menos de 2", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño Moroso", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle Morosa 1", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino Moroso", dni_cuit: "20555555555" },
    });
    const usuario = await prisma.usuario.create({
      data: { email: "moroso@test.com", auth_user_id: "00000000-0000-4000-8000-000000000302", rol: "ADMIN" },
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
    const periodoJunio = await prisma.periodoPago.create({
      data: {
        id_contrato: contrato.id,
        periodo: "2026-06",
        fecha_vencimiento: new Date("2026-06-10"),
        estado_ciclo: "CERRADO",
      },
    });
    const periodoJulio = await prisma.periodoPago.create({
      data: {
        id_contrato: contrato.id,
        periodo: "2026-07",
        fecha_vencimiento: new Date("2026-07-10"),
        estado_ciclo: "CERRADO",
      },
    });
    await prisma.cargo.create({
      data: { id_periodo: periodoJunio.id, id_contrato: contrato.id, tipo: "ALQUILER", monto: 100000 },
    });
    await prisma.cargo.create({
      data: { id_periodo: periodoJulio.id, id_contrato: contrato.id, tipo: "ALQUILER", monto: 100000 },
    });

    // Prelación cubre el Cargo más antiguo (junio) primero. Después de este
    // pago solo julio sigue con deuda vencida (1 < 2) -> el contrato vuelve
    // a ACTIVO.
    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 100000,
      idempotency_key: "ffffffff-ffff-ffff-ffff-ffffffffffff",
      id_usuario_creador: usuario.id,
    });

    const contratoActualizado = await prisma.contrato.findUniqueOrThrow({ where: { id: contrato.id } });
    assert.equal(contratoActualizado.estado, "ACTIVO");

    const cargoJunio = await prisma.cargo.findFirstOrThrow({
      where: { id_periodo: periodoJunio.id },
      include: { aplicaciones: true },
    });
    assert.equal(calcularPendiente(cargoJunio.monto, cargoJunio.aplicaciones).toNumber(), 0);
  });

  it("un pago que excede la deuda no persiste nada — el sobrante se calcula desde la transacción", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño Sobrante", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle Sobrante 1", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino Sobrante", dni_cuit: "20666666666" },
    });
    const usuario = await prisma.usuario.create({
      data: { email: "sobrante@test.com", auth_user_id: "00000000-0000-4000-8000-000000000303", rol: "ADMIN" },
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

    const resultado = await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 450000,
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });

    assert.equal(resultado.saldo_sobrante, "50000.00");

    const txn = await prisma.transaccion.findFirst({
      where: { id_contrato: contrato.id, tipo: "INGRESO_COBRO" },
      include: { aplicaciones: true },
    });
    // calcularPendiente(monto, aplicaciones) = monto - aplicado. Para una
    // Transaccion de cobro esto es lo que queda disponible sin aplicar
    // (el sobrante), igual que resultado.saldo_sobrante.
    assert.equal(calcularPendiente(txn!.monto, txn!.aplicaciones).toNumber(), 50000);
  });

  it("la deuda de un Cargo de un período viejo se cobra antes que la del período actual", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño Viejo", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle Vieja 1", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino Viejo", dni_cuit: "20777777777" },
    });
    const usuario = await prisma.usuario.create({
      data: { email: "viejo@test.com", auth_user_id: "00000000-0000-4000-8000-000000000304", rol: "ADMIN" },
    });

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
      monto_pagado: 400000, // deja $200.000 pendientes en Agosto
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });

    await (ContratosService as unknown as { avanzarPeriodo: (id: number, periodo: string, fecha: Date) => Promise<unknown> }).avanzarPeriodo(
      contrato.id,
      "2026-09",
      new Date("2026-10-10")
    ); // cierra Agosto, abre Septiembre

    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 300000,
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });

    const cargoAgosto = await prisma.cargo.findFirst({
      where: { id_contrato: contrato.id, periodo: { periodo: "2026-08" } },
      include: { aplicaciones: true },
    });
    assert.equal(calcularPendiente(cargoAgosto!.monto, cargoAgosto!.aplicaciones).toNumber(), 0); // Agosto se cobró primero

    const cargoSeptiembre = await prisma.cargo.findFirst({
      where: { id_contrato: contrato.id, periodo: { periodo: "2026-09" } },
      include: { aplicaciones: true },
    });
    assert.equal(calcularPendiente(cargoSeptiembre!.monto, cargoSeptiembre!.aplicaciones).toNumber(), 500000); // 600000 - 100000 (lo que sobró de los 300000)
  });

  it("al cobrar parcialmente la confección, reconoce como ingreso el 100% de lo aplicado", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño Confección Pago", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle Confección Pago", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino Confección Pago", dni_cuit: "20444444440" },
    });
    const usuario = await prisma.usuario.create({
      data: { email: "confeccion-pago@test.com", auth_user_id: "00000000-0000-4000-8000-000000000305", rol: "ADMIN" },
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
      estrategia_confeccion: "UN_ALQUILER", // $380.000
    });
    await ContratosService.activar(contrato.id, usuario.id);

    // Paga todo el alquiler y la mitad de la confección — punitorio no hay.
    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 570000, // 380.000 alquiler + 190.000 confección
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });

    const cargoConfeccion = await prisma.cargo.findFirstOrThrow({
      where: { id_contrato: contrato.id, tipo: "CONFECCION_CONTRATO" },
      include: { aplicaciones: true },
    });
    assert.equal(calcularPendiente(cargoConfeccion.monto, cargoConfeccion.aplicaciones).toNumber(), 190000);

    const txnCobro = await prisma.transaccion.findFirstOrThrow({
      where: { id_contrato: contrato.id, tipo: "INGRESO_COBRO" },
    });

    const ingresoConfeccion = await prisma.transaccion.findFirst({
      where: { id_contrato: contrato.id, tipo: "INGRESO_CONFECCION_CONTRATO" },
    });
    assert.ok(ingresoConfeccion, "debe reconocer el ingreso de confección al cobrarse");
    assert.equal(Number(ingresoConfeccion!.monto), 190000); // el 100% de lo aplicado, no una comisión
    assert.equal(ingresoConfeccion!.caja_destino, "OPERATIVA");
    assert.equal(ingresoConfeccion!.id_txn_origen, txnCobro.id);

    // No es una comisión — no debe generarse ninguna INGRESO_COMISION por la confección.
    const comisiones = await prisma.transaccion.count({
      where: { id_contrato: contrato.id, tipo: "INGRESO_COMISION" },
    });
    assert.equal(comisiones, 1); // solo la del alquiler, no una segunda por la confección
  });
});

describe("PagosService.listarRecientes", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("lista los pagos (aplicaciones sobre Cargo de tipo ALQUILER) ordenados por fecha descendente", async () => {
    const { contrato, usuario } = await crearEscenarioBasico({ conPunitorio: false });

    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 30000,
      idempotency_key: "10101010-1010-1010-1010-101010101010",
      id_usuario_creador: usuario.id,
    });

    const listado = await PagosService.listarRecientes();

    assert.equal(listado.length, 1);
    assert.equal(Number(listado[0].monto), 30000);
    assert.equal(listado[0].contrato_id, contrato.id);
    assert.equal(listado[0].periodo, "2026-08");
  });
});
