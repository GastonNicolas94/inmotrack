import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import { PunitoriosService } from "@/services/punitorios.service";
import { hoyEnArgentina } from "@/lib/fecha";

// Fechas relativas a hoyEnArgentina() a propósito, sin años hardcodeados.
function periodoHaceMeses(n: number): string {
  const { anio, mes } = hoyEnArgentina();
  const d = new Date(Date.UTC(anio, mes - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function crearEscenario(periodo: string, pctPunitorioDiario = 1) {
  const propietario = await prisma.propietario.create({
    data: { nombre: `Dueño ${Math.random()}`, cbu: "0000000000000000000000" },
  });
  const propiedad = await prisma.propiedad.create({
    data: { id_propietario: propietario.id, direccion: `Calle ${Math.random()}`, es_propia: false },
  });
  const inquilino = await prisma.inquilino.create({
    data: { nombre: `Inquilino ${Math.random()}`, dni_cuit: `20${Math.floor(Math.random() * 1e9)}` },
  });
  const contrato = await prisma.contrato.create({
    data: {
      id_propiedad: propiedad.id,
      id_inquilino: inquilino.id,
      fecha_inicio: new Date("2020-01-01"),
      fecha_fin: new Date("2030-12-31"),
      monto_base: 300000,
      pct_comision: 10,
      pct_punitorio_diario: pctPunitorioDiario,
      estado: "ACTIVO",
    },
  });
  const periodoPago = await prisma.periodoPago.create({
    data: {
      id_contrato: contrato.id,
      periodo,
      fecha_vencimiento: new Date(`${periodo}-10`),
      estado_ciclo: "ABIERTO",
    },
  });
  const cargo = await prisma.cargo.create({
    data: {
      id_periodo: periodoPago.id,
      id_contrato: contrato.id,
      tipo: "ALQUILER",
      monto: 300000,
    },
  });
  return { contrato, periodoPago, cargo };
}

describe("PunitoriosService.calcularIntereses", () => {
  const originalFechaSimulada = process.env.FECHA_SIMULADA;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    await cleanDatabase();
  });

  afterEach(() => {
    if (originalFechaSimulada === undefined) delete process.env.FECHA_SIMULADA;
    else process.env.FECHA_SIMULADA = originalFechaSimulada;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it("primera corrida: desde es el día 1 del período, hasta es hoy", async () => {
    const { anio, mes, dia } = hoyEnArgentina();
    const periodo = periodoHaceMeses(2);
    const { contrato, cargo } = await crearEscenario(periodo);

    const resultado = await PunitoriosService.calcularIntereses(contrato.id, [cargo.id], 1);

    assert.equal(resultado.generados, 1);
    const punitorio = await prisma.cargo.findFirst({ where: { id_cargo_origen: cargo.id } });
    assert.ok(punitorio);
    assert.equal(punitorio!.fecha_punitorio_desde!.toISOString().slice(0, 7), periodo);
    assert.equal(punitorio!.fecha_punitorio_desde!.getUTCDate(), 1);
    const hoyStr = `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    assert.equal(punitorio!.fecha_punitorio_hasta!.toISOString().slice(0, 10), hoyStr);
  });

  it("el monto generado coincide con calcularInteresAcumulado (sin pagos, tasa 1%)", async () => {
    const { anio, mes, dia } = hoyEnArgentina();
    const periodo = periodoHaceMeses(1);
    const { contrato, cargo } = await crearEscenario(periodo, 1);

    await PunitoriosService.calcularIntereses(contrato.id, [cargo.id], 1);

    const inicioPeriodo = new Date(`${periodo}-01T00:00:00.000Z`);
    const hoy = new Date(Date.UTC(anio, mes - 1, dia));
    const dias = Math.round((hoy.getTime() - inicioPeriodo.getTime()) / 86400000) + 1;
    const esperado = 300000 * 0.01 * dias;

    const punitorio = await prisma.cargo.findFirst({ where: { id_cargo_origen: cargo.id } });
    assert.equal(Number(punitorio!.monto), esperado);
  });

  it("segunda corrida el mismo día: no genera nada (desde > hasta)", async () => {
    const periodo = periodoHaceMeses(1);
    const { contrato, cargo } = await crearEscenario(periodo);

    await PunitoriosService.calcularIntereses(contrato.id, [cargo.id], 1);
    const segundaVez = await PunitoriosService.calcularIntereses(contrato.id, [cargo.id], 1);

    assert.equal(segundaVez.generados, 0);
    const punitorios = await prisma.cargo.findMany({ where: { id_cargo_origen: cargo.id } });
    assert.equal(punitorios.length, 1);
  });

  it("segunda corrida días después: arranca desde (hasta anterior + 1 día)", async () => {
    const periodo = periodoHaceMeses(2);
    const { contrato, cargo } = await crearEscenario(periodo);

    // Fechas simuladas relativas al período (no al calendario real) — así el
    // test no depende de cuándo se corre: siempre caen dentro del período
    // recién creado, sin importar qué día real sea "hoy" en ese momento.
    const primeraSimulada = `${periodo}-15`;
    const segundaSimulada = `${periodo}-22`;

    process.env.NODE_ENV = "development";
    process.env.FECHA_SIMULADA = primeraSimulada;
    const primera = await PunitoriosService.calcularIntereses(contrato.id, [cargo.id], 1);
    assert.equal(primera.generados, 1);

    process.env.FECHA_SIMULADA = segundaSimulada;
    const segunda = await PunitoriosService.calcularIntereses(contrato.id, [cargo.id], 1);
    assert.equal(segunda.generados, 1);

    const punitorios = await prisma.cargo.findMany({
      where: { id_cargo_origen: cargo.id },
      orderBy: { fecha_punitorio_desde: "asc" },
    });
    assert.equal(punitorios.length, 2);
    assert.equal(punitorios[0].fecha_punitorio_hasta!.toISOString().slice(0, 10), primeraSimulada);
    assert.equal(punitorios[1].fecha_punitorio_desde!.toISOString().slice(0, 10), `${periodo}-16`);
    assert.equal(punitorios[1].fecha_punitorio_hasta!.toISOString().slice(0, 10), segundaSimulada);
  });

  it("un Cargo PUNITORIO no es candidato — no genera punitorio sobre sí mismo", async () => {
    const periodo = periodoHaceMeses(1);
    const { contrato, cargo } = await crearEscenario(periodo);
    await PunitoriosService.calcularIntereses(contrato.id, [cargo.id], 1);
    const punitorioExistente = await prisma.cargo.findFirstOrThrow({ where: { id_cargo_origen: cargo.id } });

    const resultado = await PunitoriosService.calcularIntereses(contrato.id, [punitorioExistente.id], 1);

    assert.equal(resultado.generados, 0);
  });

  it("un Cargo ya completamente pagado no genera nada", async () => {
    const periodo = periodoHaceMeses(1);
    const { contrato, cargo } = await crearEscenario(periodo);
    const txn = await prisma.transaccion.create({
      data: { tipo: "INGRESO_COBRO", caja_destino: "TERCEROS", monto: 300000, id_contrato: contrato.id },
    });
    await prisma.aplicacionPago.create({
      data: { id_transaccion: txn.id, id_cargo: cargo.id, monto_aplicado: 300000 },
    });

    const resultado = await PunitoriosService.calcularIntereses(contrato.id, [cargo.id], 1);

    assert.equal(resultado.generados, 0);
  });

  it("selecciona múltiples Cargo en un solo llamado", async () => {
    const periodoA = periodoHaceMeses(3);
    const periodoB = periodoHaceMeses(1);
    const { contrato: contratoA, cargo: cargoA } = await crearEscenario(periodoA);
    // Segundo cargo, mismo contrato que el primero, otro período.
    const periodoPagoB = await prisma.periodoPago.create({
      data: {
        id_contrato: contratoA.id,
        periodo: periodoB,
        fecha_vencimiento: new Date(`${periodoB}-10`),
        estado_ciclo: "ABIERTO",
      },
    });
    const cargoB = await prisma.cargo.create({
      data: { id_periodo: periodoPagoB.id, id_contrato: contratoA.id, tipo: "ALQUILER", monto: 300000 },
    });

    const resultado = await PunitoriosService.calcularIntereses(contratoA.id, [cargoA.id, cargoB.id], 1);

    assert.equal(resultado.generados, 2);
  });

  it("un Cargo que no pertenece al contrato indicado se saltea sin generar nada", async () => {
    const periodo = periodoHaceMeses(1);
    const { cargo } = await crearEscenario(periodo);
    const { contrato: otroContrato } = await crearEscenario(periodo);

    const resultado = await PunitoriosService.calcularIntereses(otroContrato.id, [cargo.id], 1);

    assert.equal(resultado.generados, 0);
  });

  it("el pendiente histórico correcto se refleja en el monto (pago parcial a mitad del rango)", async () => {
    process.env.NODE_ENV = "development";
    process.env.FECHA_SIMULADA = "2026-08-05";
    const { contrato, cargo } = await crearEscenario("2026-08");

    // Se paga 100.000 el 3/8 — antes de eso el pendiente era 300.000, desde
    // ahí es 200.000. Rango 1/8 al 5/8 (5 días): 2 días a 300.000*1% + 3
    // días a 200.000*1% = 6.000 + 6.000 = 12.000.
    const txn = await prisma.transaccion.create({
      data: {
        tipo: "INGRESO_COBRO",
        caja_destino: "TERCEROS",
        monto: 100000,
        id_contrato: contrato.id,
        fecha_transaccion: new Date("2026-08-03T15:00:00.000Z"),
      },
    });
    await prisma.aplicacionPago.create({
      data: { id_transaccion: txn.id, id_cargo: cargo.id, monto_aplicado: 100000 },
    });

    await PunitoriosService.calcularIntereses(contrato.id, [cargo.id], 1);

    const punitorio = await prisma.cargo.findFirstOrThrow({ where: { id_cargo_origen: cargo.id } });
    assert.equal(Number(punitorio.monto), 12000);
  });

  it("una confección de contrato pendiente genera punitorios", async () => {
    const periodo = periodoHaceMeses(1);
    const { contrato, periodoPago } = await crearEscenario(periodo);
    const cargoConfeccion = await prisma.cargo.create({
      data: {
        id_periodo: periodoPago.id,
        id_contrato: contrato.id,
        tipo: "CONFECCION_CONTRATO",
        monto: 100000,
        descripcion: "Confección de contrato",
      },
    });

    const resultado = await PunitoriosService.calcularIntereses(
      contrato.id,
      [cargoConfeccion.id],
      1
    );

    assert.equal(resultado.generados, 1);
    const punitorio = await prisma.cargo.findFirst({
      where: { id_cargo_origen: cargoConfeccion.id },
    });
    assert.ok(punitorio);
    assert.equal(punitorio!.tipo, "PUNITORIO");
    assert.ok(Number(punitorio!.monto) > 0);
  });

  it("dos llamados concurrentes sobre el mismo Cargo no duplican el rango (el lock serializa, uno de los dos no-opea)", async () => {
    const periodo = periodoHaceMeses(1);
    const { contrato, cargo } = await crearEscenario(periodo);

    const [r1, r2] = await Promise.all([
      PunitoriosService.calcularIntereses(contrato.id, [cargo.id], 1),
      PunitoriosService.calcularIntereses(contrato.id, [cargo.id], 1),
    ]);

    // Entre los dos, solo uno debería haber generado la fila (el otro,
    // al correr después bajo el lock, ve desde > hasta y no-opea).
    assert.equal(r1.generados + r2.generados, 1);
    const punitorios = await prisma.cargo.findMany({ where: { id_cargo_origen: cargo.id } });
    assert.equal(punitorios.length, 1);
  });

  it("el Cargo PUNITORIO se genera en el período ABIERTO actual, no en el período (CERRADO) del cargo de origen", async () => {
    const periodoViejo = periodoHaceMeses(2);
    const periodoActual = periodoHaceMeses(0);
    const { contrato, cargo } = await crearEscenario(periodoViejo);
    // El cargo de origen queda en un período ya CERRADO — simula el
    // avance normal de meses que haría el motor de cierre.
    await prisma.periodoPago.update({
      where: { id: cargo.id_periodo },
      data: { estado_ciclo: "CERRADO" },
    });
    const periodoAbierto = await prisma.periodoPago.create({
      data: {
        id_contrato: contrato.id,
        periodo: periodoActual,
        fecha_vencimiento: new Date(`${periodoActual}-10`),
        estado_ciclo: "ABIERTO",
      },
    });

    await PunitoriosService.calcularIntereses(contrato.id, [cargo.id], 1);

    const punitorio = await prisma.cargo.findFirstOrThrow({ where: { id_cargo_origen: cargo.id } });
    assert.equal(punitorio.id_periodo, periodoAbierto.id);
    assert.notEqual(punitorio.id_periodo, cargo.id_periodo);
  });
});
