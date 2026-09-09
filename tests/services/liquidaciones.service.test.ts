import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "@prisma/client/runtime/client";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import { ContratosService } from "@/services/contratos.service";
import { PagosService } from "@/services/pagos.service";
import { GastosService } from "@/services/gastos.service";
import { AdelantosService } from "@/services/adelantos.service";
import { LiquidacionesService } from "@/services/liquidaciones.service";

/**
 * Helper: fecha relativa a "ahora" +/- `offsetDias` días, en vez de una fecha
 * calendario fija — Transaccion.fecha_transaccion y Gasto.creado_en usan
 * `@default(now())` (el reloj real del servidor, no FECHA_SIMULADA), así que
 * cualquier `hasta`/`desde` hardcodeado a un mes fijo del pasado se vuelve
 * no-determinístico apenas corre este archivo en otra fecha real.
 */
function diasDesdeAhora(offsetDias: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDias);
  return d;
}

/**
 * Helper: crea un propietario, propiedad, inquilino, usuario y contrato activado
 * listos para usar. Retorna todas las entidades creadas.
 */
async function crearEscenarioBasico(opts?: { pct_comision?: number; nombre_propietario?: string }) {
  const propietario = await prisma.propietario.create({
    data: { nombre: opts?.nombre_propietario ?? "Propietario Test", cbu: "0000000000000000000000" },
  });
  const propiedad = await prisma.propiedad.create({
    data: { id_propietario: propietario.id, direccion: "Calle Test 123", es_propia: false },
  });
  const inquilino = await prisma.inquilino.create({
    data: { nombre: "Inquilino Test", dni_cuit: "20111111111" },
  });
  const usuario = await prisma.usuario.create({
    data: { email: `test-${propietario.id}@test.com`, password_hash: "x", rol: "ADMIN" },
  });

  const contrato = await ContratosService.crear({
    id_propiedad: propiedad.id,
    id_inquilino: inquilino.id,
    fecha_inicio: "2026-08-01",
    fecha_fin: "2026-12-31",
    monto_base: 100000,
    pct_comision: opts?.pct_comision ?? 10,
    pct_punitorio_diario: 0.1,
  });

  await ContratosService.activar(contrato.id, usuario.id);

  return { propietario, propiedad, inquilino, usuario, contrato };
}

describe("LiquidacionesService.generarParaPropietario", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("pago dentro del rango genera 1 LiquidacionItem con id_periodo seteado, comision correcta, monto_neto correcto, y sella AplicacionPago", async () => {
    const { propietario, contrato, usuario } = await crearEscenarioBasico();

    // Crear un pago que caiga dentro del rango de la liquidación (se registra
    // "ahora" — Transaccion.fecha_transaccion usa @default(now())).
    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 80000,
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });

    // hasta = mañana: cubre con margen cualquier pago registrado "ahora".
    const liquidacion = await LiquidacionesService.generarParaPropietario(
      propietario.id,
      diasDesdeAhora(1)
    );

    assert.ok(liquidacion.items.length > 0, "debe generar al menos 1 LiquidacionItem");

    const item = liquidacion.items[0];
    assert.ok(item.id_periodo !== null, "id_periodo debe estar seteado para alquiler");
    assert.equal(Number(item.monto_bruto), 80000, "monto_bruto es lo cobrado");
    assert.equal(Number(item.comision), 8000, "comisión es 10% del bruto");
    assert.equal(Number(item.monto_neto), 72000, "neto = bruto - comisión");

    // Verificar que AplicacionPago quedó sellada
    const aplicacionSellada = await prisma.aplicacionPago.findFirstOrThrow({
      where: { cargo: { tipo: "ALQUILER" } },
    });
    assert.ok(aplicacionSellada.id_liquidacion_item !== null, "AplicacionPago debe estar sellada");
    assert.equal(aplicacionSellada.id_liquidacion_item, item.id, "debe apuntar al LiquidacionItem correcto");
  });

  it("pago fuera del rango (antes de desde) NO entra en la liquidación", async () => {
    const { propietario, contrato, usuario } = await crearEscenarioBasico();

    // `desde` se calcula a partir de la última Liquidacion del propietario —
    // sin ninguna previa, `desde` cae en el piso (1900), y ninguna fecha real
    // quedaría "antes" de eso. Para probar el caso "antes de desde" hace
    // falta una Liquidacion previa real que fije un `desde` significativo.
    await prisma.liquidacion.create({
      data: {
        id_propietario: propietario.id,
        fecha_desde: diasDesdeAhora(-100),
        fecha_hasta: diasDesdeAhora(-40), // próximo `desde` calculado = -39
        monto_bruto: 0,
        retenciones: 0,
        monto_neto: 0,
      },
    });

    // Pago viejo (-60 días), anterior al `desde` (-39) que va a calcular la
    // próxima corrida — se crea manualmente para controlar la fecha exacta.
    const transaccion = await prisma.transaccion.create({
      data: {
        tipo: "INGRESO_COBRO",
        caja_destino: "TERCEROS",
        monto: new Decimal(50000),
        fecha_transaccion: diasDesdeAhora(-60),
        id_contrato: contrato.id,
        id_usuario_creador: usuario.id,
      },
    });

    // Obtener el período de agosto (creado al activar el contrato)
    const periodo = await prisma.periodoPago.findFirstOrThrow({
      where: { id_contrato: contrato.id },
    });

    // Obtener el cargo de alquiler
    const cargo = await prisma.cargo.findFirstOrThrow({
      where: { id_periodo: periodo.id, tipo: "ALQUILER" },
    });

    // Crear manualmente una AplicacionPago para esa transaccion
    await prisma.aplicacionPago.create({
      data: {
        id_transaccion: transaccion.id,
        id_cargo: cargo.id,
        monto_aplicado: new Decimal(50000),
      },
    });

    const liquidacion = await LiquidacionesService.generarParaPropietario(
      propietario.id,
      diasDesdeAhora(1)
    );

    // El pago (-60) es anterior al `desde` calculado (-39): no debe entrar.
    assert.equal(liquidacion.items.length, 0, "no debe incluir pagos fuera del rango");
    assert.equal(Number(liquidacion.monto_bruto), 0);
  });

  it("pago ya sellado por una corrida anterior NO vuelve a entrar en una segunda corrida aunque su fecha caiga en el rango", async () => {
    const { propietario, contrato, usuario } = await crearEscenarioBasico();

    // Crear un pago en agosto
    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 60000,
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });

    // Primera liquidación: hasta = mañana, cubre con margen el pago recién registrado.
    const liq1 = await LiquidacionesService.generarParaPropietario(
      propietario.id,
      diasDesdeAhora(1)
    );

    assert.equal(Number(liq1.monto_bruto), 60000, "primera corrida captura el pago");

    // Segunda liquidación: rango posterior, que en teoría "incluiría" la fecha
    // real del pago otra vez si no estuviera ya sellado.
    const liq2 = await LiquidacionesService.generarParaPropietario(
      propietario.id,
      diasDesdeAhora(31)
    );

    // El `desde` de la segunda corrida debe ser 2026-09-01 (después del `hasta` de la primera)
    // Por lo tanto, el pago de agosto NO debe entrar nuevamente
    assert.equal(liq2.items.length, 0, "segunda corrida no debe reincluir pagos ya liquidados");
    assert.equal(Number(liq2.monto_bruto), 0);
  });

  it("gasto a cargo del propietario genera LiquidacionItem separado con id_periodo null y monto_neto negativo", async () => {
    const { propietario, propiedad, usuario } = await crearEscenarioBasico();

    // Crear un gasto a cargo del propietario
    const gasto = await GastosService.crear({
      id_propiedad: propiedad.id,
      concepto: "Reparación de plomería",
      monto: 15000,
      tipo: "ARREGLO",
      cargo_a: "PROPIETARIO",
    });

    // Liquidar (hasta = mañana, cubre con margen el gasto recién creado)
    const liquidacion = await LiquidacionesService.generarParaPropietario(
      propietario.id,
      diasDesdeAhora(1)
    );

    // Debe haber un LiquidacionItem con id_periodo = null
    const itemGasto = liquidacion.items.find((it) => it.id_periodo === null);
    assert.ok(itemGasto, "debe existir un item con id_periodo null para el gasto");
    assert.equal(Number(itemGasto.gastos), 15000, "gastos debe ser el monto del gasto");
    assert.equal(Number(itemGasto.monto_bruto), 0, "bruto debe ser 0 para un item de gasto puro");
    assert.equal(Number(itemGasto.comision), 0, "comisión debe ser 0");
    assert.equal(Number(itemGasto.monto_neto), -15000, "neto debe ser negativo (es un descuento)");

    // Verificar que el Gasto quedó sellado
    const gastoSellado = await prisma.gasto.findUniqueOrThrow({ where: { id: gasto.id } });
    assert.ok(gastoSellado.id_liquidacion_item !== null, "Gasto debe estar sellado");
    assert.equal(gastoSellado.id_liquidacion_item, itemGasto.id);
  });

  it("pago que cubre 2 períodos en una sola corrida genera 2 LiquidacionItem, uno por período", async () => {
    const { propietario, contrato, usuario } = await crearEscenarioBasico();

    // Crear un segundo período (septiembre)
    const periodoAgosto = await prisma.periodoPago.findFirstOrThrow({
      where: { id_contrato: contrato.id },
    });

    const periodoSeptiembre = await prisma.periodoPago.create({
      data: {
        id_contrato: contrato.id,
        periodo: "2026-09",
        fecha_vencimiento: new Date("2026-09-10"),
        estado_ciclo: "CERRADO",
      },
    });

    // Crear cargos para ambos períodos
    const cargoAgosto = await prisma.cargo.findFirstOrThrow({
      where: { id_periodo: periodoAgosto.id, tipo: "ALQUILER" },
    });

    const cargoSeptiembre = await prisma.cargo.create({
      data: {
        id_periodo: periodoSeptiembre.id,
        id_contrato: contrato.id,
        tipo: "ALQUILER",
        monto: new Decimal(100000),
      },
    });

    // Un pago en septiembre que cubre ambos períodos
    // Primero, dejar un saldo pendiente en agosto
    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 80000, // Parcial en agosto
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });

    // Después, otro pago que cubre lo restante de agosto + septiembre
    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 120000, // 20000 restante de agosto + 100000 de septiembre
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });

    // Liquidar en rango que cubre ambos períodos (hasta = mañana, con margen)
    const liquidacion = await LiquidacionesService.generarParaPropietario(
      propietario.id,
      diasDesdeAhora(1)
    );

    // Debe haber 2 items: uno por agosto, otro por septiembre
    const itemsAlquiler = liquidacion.items.filter((it) => it.id_periodo !== null);
    assert.equal(
      itemsAlquiler.length,
      2,
      "debe generar 2 LiquidacionItem (uno por período), no uno fundido"
    );
  });

  it("encadenamiento: segunda corrida con `hasta` posterior no reincluye nada ya liquidado", async () => {
    const { propietario, contrato, usuario } = await crearEscenarioBasico();

    // Pago "viejo" (-10 días): `transacciones` es inmutable (trigger de DB,
    // no se puede UPDATE/DELETE) y PagosService.registrar no acepta
    // fecha_transaccion como parámetro — así que para controlar la fecha
    // exacta se construye manualmente (Transaccion + AplicacionPago), igual
    // que en el test "antes de desde".
    const periodoAgosto = await prisma.periodoPago.findFirstOrThrow({
      where: { id_contrato: contrato.id },
    });
    const cargoAgosto = await prisma.cargo.findFirstOrThrow({
      where: { id_periodo: periodoAgosto.id, tipo: "ALQUILER" },
    });
    const txnVieja = await prisma.transaccion.create({
      data: {
        tipo: "INGRESO_COBRO",
        caja_destino: "TERCEROS",
        monto: new Decimal(70000),
        fecha_transaccion: diasDesdeAhora(-10),
        id_contrato: contrato.id,
        id_usuario_creador: usuario.id,
      },
    });
    await prisma.aplicacionPago.create({
      data: { id_transaccion: txnVieja.id, id_cargo: cargoAgosto.id, monto_aplicado: new Decimal(70000) },
    });

    // Primera liquidación: hasta -5 días, cubre el pago viejo (-10)
    const liq1 = await LiquidacionesService.generarParaPropietario(
      propietario.id,
      diasDesdeAhora(-5)
    );

    assert.equal(Number(liq1.monto_bruto), 70000);

    // Crear un segundo período, con su Cargo de alquiler correspondiente —
    // sin el Cargo, el pago nuevo no tiene contra qué aplicarse y el
    // sobrante queda flotando sin persistirse (PagosService.registrar no
    // crea Cargo por período nuevo, eso lo hace ContratosService.abrirPeriodo).
    const periodoSeptiembre = await prisma.periodoPago.create({
      data: {
        id_contrato: contrato.id,
        periodo: "2026-09",
        fecha_vencimiento: new Date("2026-09-10"),
        estado_ciclo: "ABIERTO",
      },
    });
    await prisma.cargo.create({
      data: {
        id_periodo: periodoSeptiembre.id,
        id_contrato: contrato.id,
        tipo: "ALQUILER",
        monto: new Decimal(100000),
      },
    });

    // Pago "nuevo": se registra ahora (now() real), posterior al hasta de liq1 (-5)
    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 50000,
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });

    // Segunda liquidación: hasta = mañana, con margen sobre el pago nuevo
    const liq2 = await LiquidacionesService.generarParaPropietario(
      propietario.id,
      diasDesdeAhora(1)
    );

    // Debe incluir SOLO el pago de septiembre, no el de agosto (ya liquidado)
    assert.equal(
      Number(liq2.monto_bruto),
      50000,
      "segunda corrida debe incluir solo lo nuevo"
    );
    assert.ok(liq2.fecha_desde > liq1.fecha_hasta, "desde de liq2 debe ser después del hasta de liq1");
  });

  it("descuento parcial de adelantos reduce monto_neto y genera 1 DeduccionAdelanto", async () => {
    const { propietario, contrato, usuario } = await crearEscenarioBasico();

    // Registrar un adelanto de 50000
    const adelanto = await AdelantosService.registrar({
      id_propietario: propietario.id,
      monto: 50000,
      id_usuario_creador: usuario.id,
    });

    // Pago de 100000
    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 100000,
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });

    // Liquidar descontando 30000 de los 50000 pendientes (hasta = mañana)
    const liquidacion = await LiquidacionesService.generarParaPropietario(
      propietario.id,
      diasDesdeAhora(1),
      30000
    );

    // monto_bruto = 100000, retenciones = 10000 (comisión), adelantos = 30000
    // monto_neto = 100000 - 10000 - 30000 = 60000
    assert.equal(Number(liquidacion.monto_neto), 60000, "neto debe restar adelantos descontados");
    assert.equal(Number(liquidacion.adelantos_descontados), 30000);

    // Debe existir una DeduccionAdelanto
    const deducciones = liquidacion.deducciones;
    assert.equal(deducciones.length, 1, "debe haber 1 deducción");
    assert.equal(deducciones[0].id_transaccion, adelanto.id);
    assert.equal(Number(deducciones[0].monto_descontado), 30000);
  });

  it("pedir descontar más de lo pendiente rechaza", async () => {
    const { propietario, contrato, usuario } = await crearEscenarioBasico();

    // Registrar adelanto de 20000
    await AdelantosService.registrar({
      id_propietario: propietario.id,
      monto: 20000,
      id_usuario_creador: usuario.id,
    });

    // Pago normal
    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 50000,
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });

    // Intentar descontar 40000 cuando solo hay 20000 pendientes
    await assert.rejects(
      () =>
        LiquidacionesService.generarParaPropietario(
          propietario.id,
          diasDesdeAhora(1),
          40000
        ),
      /No se puede descontar/
    );
  });

  it("dos adelantos: descuento parcial que cubre parte de ambos genera 2 DeduccionAdelanto en orden de antigüedad", async () => {
    const { propietario, contrato, usuario } = await crearEscenarioBasico();

    // Primer adelanto: 30000 (viejo)
    const adelanto1 = await prisma.transaccion.create({
      data: {
        tipo: "EGRESO_ADELANTO",
        caja_destino: "TERCEROS",
        monto: new Decimal(-30000),
        id_propietario: propietario.id,
        id_usuario_creador: usuario.id,
        fecha_transaccion: new Date("2026-08-01"),
      },
    });

    // Segundo adelanto: 20000 (más nuevo)
    const adelanto2 = await AdelantosService.registrar({
      id_propietario: propietario.id,
      monto: 20000,
      id_usuario_creador: usuario.id,
    });

    // Pago normal
    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 80000,
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });

    // Descontar 40000: debe tomar 30000 del primer (viejo) + 10000 del segundo
    const liquidacion = await LiquidacionesService.generarParaPropietario(
      propietario.id,
      diasDesdeAhora(1),
      40000
    );

    assert.equal(Number(liquidacion.adelantos_descontados), 40000);

    const deducciones = liquidacion.deducciones.sort((a, b) => a.id_transaccion - b.id_transaccion);
    assert.equal(deducciones.length, 2, "debe haber 2 deducciones (una por cada adelanto tocado)");

    // Primera deducción: del adelanto viejo
    assert.equal(deducciones[0].id_transaccion, adelanto1.id);
    assert.equal(Number(deducciones[0].monto_descontado), 30000);

    // Segunda deducción: del adelanto más nuevo
    assert.equal(deducciones[1].id_transaccion, adelanto2.id);
    assert.equal(Number(deducciones[1].monto_descontado), 10000);
  });
});

describe("LiquidacionesService.listar", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("lista todas las liquidaciones o solo las de un propietario si se filtra", async () => {
    const prop1 = await prisma.propietario.create({
      data: { nombre: "Prop 1", cbu: "0000000000000000000000" },
    });
    const prop2 = await prisma.propietario.create({
      data: { nombre: "Prop 2", cbu: "1111111111111111111111" },
    });

    await prisma.liquidacion.create({
      data: {
        id_propietario: prop1.id,
        fecha_desde: new Date("2026-08-01"),
        fecha_hasta: new Date("2026-08-31"),
        monto_bruto: new Decimal(100000),
        retenciones: new Decimal(10000),
        monto_neto: new Decimal(90000),
      },
    });

    await prisma.liquidacion.create({
      data: {
        id_propietario: prop2.id,
        fecha_desde: new Date("2026-08-01"),
        fecha_hasta: new Date("2026-08-31"),
        monto_bruto: new Decimal(50000),
        retenciones: new Decimal(5000),
        monto_neto: new Decimal(45000),
      },
    });

    const todas = await LiquidacionesService.listar();
    assert.equal(todas.length, 2);

    const filtradas = await LiquidacionesService.listar(prop1.id);
    assert.equal(filtradas.length, 1);
    assert.equal(filtradas[0].id_propietario, prop1.id);
  });
});

describe("LiquidacionesService.aprobar / confirmarPago", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("aprobar genera EGRESO_LIQUIDACION por el monto neto y cambia el estado a APROBADA", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Propietario Prueba", cbu: "0000000000000000000000" },
    });
    const usuario = await prisma.usuario.create({
      data: { email: "prueba@test.com", password_hash: "x", rol: "ADMIN" },
    });

    const liquidacion = await prisma.liquidacion.create({
      data: {
        id_propietario: propietario.id,
        fecha_desde: new Date("2026-08-01"),
        fecha_hasta: new Date("2026-08-31"),
        monto_bruto: new Decimal(100000),
        retenciones: new Decimal(10000),
        monto_neto: new Decimal(90000),
      },
    });

    const aprobada = await LiquidacionesService.aprobar(liquidacion.id, usuario.id);
    assert.equal(aprobada.estado, "APROBADA");

    // Verificar que se creó la EGRESO_LIQUIDACION
    const txn = await prisma.transaccion.findFirstOrThrow({
      where: { tipo: "EGRESO_LIQUIDACION" },
    });
    assert.equal(txn.caja_destino, "TERCEROS");
    assert.equal(Number(txn.monto), -90000, "EGRESO es el monto_neto negado");

    // Confirmar pago
    const confirmada = await LiquidacionesService.confirmarPago(liquidacion.id);
    assert.equal(confirmada.estado, "PAGADA");
  });

  it("rechaza aprobar una liquidación con neto negativo (adelanto sin respaldo de alquiler cobrado)", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Propietario Neto Negativo", cbu: "0000000000000000000000" },
    });
    const usuario = await prisma.usuario.create({
      data: { email: "neto-negativo@test.com", password_hash: "x", rol: "ADMIN" },
    });

    const liquidacion = await prisma.liquidacion.create({
      data: {
        id_propietario: propietario.id,
        fecha_desde: new Date("2026-08-01"),
        fecha_hasta: new Date("2026-08-31"),
        monto_bruto: new Decimal(0),
        retenciones: new Decimal(0),
        adelantos_descontados: new Decimal(10000),
        monto_neto: new Decimal(-10000),
      },
    });

    await assert.rejects(
      () => LiquidacionesService.aprobar(liquidacion.id, usuario.id),
      /neto negativo/
    );

    // No debe haber generado ningún EGRESO_LIQUIDACION, y el estado sigue PENDIENTE
    const txn = await prisma.transaccion.findFirst({ where: { tipo: "EGRESO_LIQUIDACION" } });
    assert.equal(txn, null);
    const sinCambios = await prisma.liquidacion.findUniqueOrThrow({ where: { id: liquidacion.id } });
    assert.equal(sinCambios.estado, "PENDIENTE");
  });

  it("rechaza aprobar una liquidación que no está en estado PENDIENTE", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Propietario Prueba 2", cbu: "0000000000000000000000" },
    });
    const usuario = await prisma.usuario.create({
      data: { email: "prueba2@test.com", password_hash: "x", rol: "ADMIN" },
    });

    const liquidacion = await prisma.liquidacion.create({
      data: {
        id_propietario: propietario.id,
        fecha_desde: new Date("2026-08-01"),
        fecha_hasta: new Date("2026-08-31"),
        monto_bruto: new Decimal(100000),
        retenciones: new Decimal(10000),
        monto_neto: new Decimal(90000),
        estado: "APROBADA", // Ya aprobada
      },
    });

    await assert.rejects(() => LiquidacionesService.aprobar(liquidacion.id, usuario.id));
  });

  it("rechaza confirmar el pago de una liquidación que no está en estado APROBADA", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Propietario Prueba 3", cbu: "0000000000000000000000" },
    });

    const liquidacion = await prisma.liquidacion.create({
      data: {
        id_propietario: propietario.id,
        fecha_desde: new Date("2026-08-01"),
        fecha_hasta: new Date("2026-08-31"),
        monto_bruto: new Decimal(100000),
        retenciones: new Decimal(10000),
        monto_neto: new Decimal(90000),
        estado: "PENDIENTE", // No aprobada
      },
    });

    await assert.rejects(() => LiquidacionesService.confirmarPago(liquidacion.id));
  });
});
