import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import { TransaccionesService } from "@/services/transacciones.service";
import { ContratosService } from "@/services/contratos.service";
import { PagosService } from "@/services/pagos.service";
import { calcularPendiente } from "@/lib/saldos";

describe("TransaccionesService.crearContraAsiento", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("crea una transacción con monto invertido y la enlaza a la original", async () => {
    const usuario = await prisma.usuario.create({
    data: { email: "admin8@test.com", auth_user_id: "00000000-0000-4000-8000-000000000401", rol: "ADMIN" },
    });
    const original = await prisma.transaccion.create({
      data: { tipo: "INGRESO_PUNITORIO", caja_destino: "OPERATIVA", monto: 5000 },
    });

    const contraAsiento = await TransaccionesService.crearContraAsiento({
      id_txn_origen: original.id,
      comentario: "Punitorio generado por error, contrato ya saldado.",
      id_usuario_creador: usuario.id,
    });

    assert.equal(contraAsiento.tipo, "CONTRA_ASIENTO");
    assert.equal(Number(contraAsiento.monto), -5000);
    assert.equal(contraAsiento.id_txn_origen, original.id);
    assert.equal(contraAsiento.caja_destino, original.caja_destino);
  });

  it("reversa la AplicacionPago asociada a la transacción original contra el mismo Cargo, cuando el período sigue ABIERTO", async () => {
    const usuario = await prisma.usuario.create({
    data: { email: "admin9@test.com", auth_user_id: "00000000-0000-4000-8000-000000000402", rol: "ADMIN" },
    });
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño 5", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle 5", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino 5", dni_cuit: "20333333333" },
    });
    const contrato = await prisma.contrato.create({
      data: {
        id_propiedad: propiedad.id,
        id_inquilino: inquilino.id,
        fecha_inicio: new Date("2026-01-01"),
        fecha_fin: new Date("2026-12-31"),
        monto_base: 1000,
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
    const cargoPunitorio = await prisma.cargo.create({
      data: { id_periodo: periodo.id, id_contrato: contrato.id, tipo: "PUNITORIO", monto: 500 },
    });
    const original = await prisma.transaccion.create({
      data: { tipo: "INGRESO_PUNITORIO", caja_destino: "OPERATIVA", monto: 500, id_contrato: contrato.id },
    });
    await prisma.aplicacionPago.create({
      data: { id_transaccion: original.id, id_cargo: cargoPunitorio.id, monto_aplicado: 500 },
    });

    await TransaccionesService.crearContraAsiento({
      id_txn_origen: original.id,
      comentario: "Error de carga.",
      id_usuario_creador: usuario.id,
    });

    const cargoActualizado = await prisma.cargo.findUniqueOrThrow({
      where: { id: cargoPunitorio.id },
      include: { aplicaciones: true },
    });
    assert.equal(calcularPendiente(cargoActualizado.monto, cargoActualizado.aplicaciones).toNumber(), 500);
  });

  it("rechaza un contra-asiento sin comentario", async () => {
    const usuario = await prisma.usuario.create({
    data: { email: "admin10@test.com", auth_user_id: "00000000-0000-4000-8000-000000000403", rol: "ADMIN" },
    });
    const original = await prisma.transaccion.create({
      data: { tipo: "INGRESO_COBRO", caja_destino: "TERCEROS", monto: 100 },
    });

    await assert.rejects(
      TransaccionesService.crearContraAsiento({
        id_txn_origen: original.id,
        comentario: "",
        id_usuario_creador: usuario.id,
      })
    );
  });

  it("contra-asiento sobre un Cargo de un período ABIERTO revierte directo contra el mismo Cargo", async () => {
    const usuario = await prisma.usuario.create({
    data: { email: "abierto@test.com", auth_user_id: "00000000-0000-4000-8000-000000000404", rol: "ADMIN" },
    });
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño Abierto", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle Abierta 1", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino Abierto", dni_cuit: "20888888888" },
    });

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
      monto_pagado: 600000,
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });
    const txnCobro = await prisma.transaccion.findFirst({
      where: { id_contrato: contrato.id, tipo: "INGRESO_COBRO" },
    });

    await TransaccionesService.crearContraAsiento({
      id_txn_origen: txnCobro!.id,
      comentario: "error de cobro",
      id_usuario_creador: usuario.id,
    });

    const cargo = await prisma.cargo.findFirst({
      where: { id_contrato: contrato.id, tipo: "ALQUILER" },
      include: { aplicaciones: true },
    });
    assert.equal(calcularPendiente(cargo!.monto, cargo!.aplicaciones).toNumber(), 600000); // vuelve a deber todo
  });

  it("contra-asiento sobre un Cargo de un período CERRADO genera un Cargo AJUSTE en el período abierto actual, sin tocar el viejo", async () => {
    const usuario = await prisma.usuario.create({
    data: { email: "cerrado@test.com", auth_user_id: "00000000-0000-4000-8000-000000000405", rol: "ADMIN" },
    });
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño Cerrado", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle Cerrada 1", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino Cerrado", dni_cuit: "20999999999" },
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
      monto_pagado: 600000,
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });
    const txnCobro = await prisma.transaccion.findFirst({
      where: { id_contrato: contrato.id, tipo: "INGRESO_COBRO" },
    });
    await ContratosService.avanzarPeriodo(contrato.id, "2026-09", new Date("2026-10-10")); // cierra Agosto

    await TransaccionesService.crearContraAsiento({
      id_txn_origen: txnCobro!.id,
      comentario: "cheque rechazado",
      id_usuario_creador: usuario.id,
    });

    const cargoAgosto = await prisma.cargo.findFirst({
      where: { id_contrato: contrato.id, periodo: { periodo: "2026-08" } },
      include: { aplicaciones: true },
    });
    assert.equal(calcularPendiente(cargoAgosto!.monto, cargoAgosto!.aplicaciones).toNumber(), 0); // Agosto no se tocó

    const cargoAjuste = await prisma.cargo.findFirst({
      where: { id_contrato: contrato.id, tipo: "AJUSTE", periodo: { periodo: "2026-09" } },
      include: { aplicaciones: true },
    });
    assert.ok(cargoAjuste, "debe existir un Cargo AJUSTE en Septiembre");
    assert.equal(calcularPendiente(cargoAjuste!.monto, cargoAjuste!.aplicaciones).toNumber(), 600000); // deuda nueva, cobrable
  });

  it("al anular un cobro, revierte en cascada la comisión que ese cobro generó", async () => {
    const usuario = await prisma.usuario.create({
    data: { email: "cascada1@test.com", auth_user_id: "00000000-0000-4000-8000-000000000406", rol: "ADMIN" },
    });
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño Cascada 1", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle Cascada 1", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino Cascada 1", dni_cuit: "20111111111" },
    });

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
      monto_pagado: 600000,
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });

    const txnCobro = await prisma.transaccion.findFirstOrThrow({
      where: { id_contrato: contrato.id, tipo: "INGRESO_COBRO" },
    });
    const comision = await prisma.transaccion.findFirstOrThrow({
      where: { id_contrato: contrato.id, tipo: "INGRESO_COMISION" },
    });
    // La comisión debe quedar trazada hacia el cobro que la generó.
    assert.equal(comision.id_txn_origen, txnCobro.id);
    assert.equal(Number(comision.monto), 60000);

    await TransaccionesService.crearContraAsiento({
      id_txn_origen: txnCobro.id,
      comentario: "cheque rechazado",
      id_usuario_creador: usuario.id,
    });

    const contraAsientoComision = await prisma.transaccion.findFirst({
      where: { id_contrato: contrato.id, tipo: "CONTRA_ASIENTO", id_txn_origen: comision.id },
    });
    assert.ok(contraAsientoComision, "debe existir un contra-asiento que revierte la comisión derivada");
    assert.equal(Number(contraAsientoComision!.monto), -60000);
  });

  it("al anular un cobro, revierte en cascada el ingreso por confección y restaura su deuda", async () => {
    const usuario = await prisma.usuario.create({
      data: {
        email: "contra-confeccion@test.com",
        auth_user_id: "00000000-0000-4000-8000-000000000408",
        rol: "ADMIN",
      },
    });
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño Contra Confección", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: {
        id_propietario: propietario.id,
        direccion: "Calle Contra Confección",
        es_propia: false,
      },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino Contra Confección", dni_cuit: "20444444448" },
    });
    const contrato = await ContratosService.crear({
      id_propiedad: propiedad.id,
      id_inquilino: inquilino.id,
      fecha_inicio: "2026-08-01",
      fecha_fin: "2027-07-31",
      monto_base: 100000,
      pct_comision: 10,
      pct_punitorio_diario: 0.1,
      cobra_confeccion: true,
      estrategia_confeccion: "UN_ALQUILER",
    });
    await ContratosService.activar(contrato.id, usuario.id);
    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 200000,
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });

    const txnCobro = await prisma.transaccion.findFirstOrThrow({
      where: { id_contrato: contrato.id, tipo: "INGRESO_COBRO" },
    });
    const ingresoConfeccion = await prisma.transaccion.findFirstOrThrow({
      where: { id_contrato: contrato.id, tipo: "INGRESO_CONFECCION_CONTRATO" },
    });

    await TransaccionesService.crearContraAsiento({
      id_txn_origen: txnCobro.id,
      comentario: "cobro rechazado",
      id_usuario_creador: usuario.id,
    });

    const contraIngresoConfeccion = await prisma.transaccion.findFirst({
      where: {
        id_contrato: contrato.id,
        tipo: "CONTRA_ASIENTO",
        id_txn_origen: ingresoConfeccion.id,
      },
    });
    assert.ok(contraIngresoConfeccion);
    assert.equal(Number(contraIngresoConfeccion!.monto), -100000);

    const cargoConfeccion = await prisma.cargo.findFirstOrThrow({
      where: { id_contrato: contrato.id, tipo: "CONFECCION_CONTRATO" },
      include: { aplicaciones: true },
    });
    assert.equal(
      calcularPendiente(cargoConfeccion.monto, cargoConfeccion.aplicaciones).toNumber(),
      100000
    );
  });

  it("al anular un cobro que generó crédito heredado, revierte en cascada la comisión que se cobró al abrir el período siguiente", async () => {
    const usuario = await prisma.usuario.create({
    data: { email: "cascada2@test.com", auth_user_id: "00000000-0000-4000-8000-000000000407", rol: "ADMIN" },
    });
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño Cascada 2", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle Cascada 2", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino Cascada 2", dni_cuit: "20222222222" },
    });

    const contrato = await ContratosService.crear({
      id_propiedad: propiedad.id,
      id_inquilino: inquilino.id,
      fecha_inicio: "2026-01-01",
      fecha_fin: "2026-12-31",
      monto_base: 600000,
      pct_comision: 10,
      pct_punitorio_diario: 0.1,
    });
    await ContratosService.activar(contrato.id); // Agosto
    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 700000, // 600k al alquiler + 100k de sobrante
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });
    const txnCobro = await prisma.transaccion.findFirstOrThrow({
      where: { id_contrato: contrato.id, tipo: "INGRESO_COBRO" },
    });

    await ContratosService.avanzarPeriodo(contrato.id, "2026-09", new Date("2026-10-10")); // cierra Agosto, arrastra 100k

    // Dos comisiones derivadas de la misma txnCobro: 60k al momento del pago
    // (sobre los 600k de alquiler) y 10k al abrir Septiembre (sobre los 100k
    // de crédito heredado aplicados contra el alquiler nuevo).
    const comisiones = await prisma.transaccion.findMany({
      where: { id_contrato: contrato.id, tipo: "INGRESO_COMISION" },
      orderBy: { monto: "desc" },
    });
    assert.equal(comisiones.length, 2);
    assert.ok(comisiones.every((c) => c.id_txn_origen === txnCobro.id));
    assert.equal(Number(comisiones[0].monto), 60000);
    assert.equal(Number(comisiones[1].monto), 10000);

    await TransaccionesService.crearContraAsiento({
      id_txn_origen: txnCobro.id,
      comentario: "cheque rechazado, incluye el crédito heredado",
      id_usuario_creador: usuario.id,
    });

    const contraAsientosComisiones = await prisma.transaccion.findMany({
      where: {
        id_contrato: contrato.id,
        tipo: "CONTRA_ASIENTO",
        id_txn_origen: { in: comisiones.map((c) => c.id) },
      },
    });
    assert.equal(contraAsientosComisiones.length, 2, "ambas comisiones derivadas deben quedar revertidas");
    const montosRevertidos = contraAsientosComisiones.map((t) => Number(t.monto)).sort((a, b) => a - b);
    assert.deepEqual(montosRevertidos, [-60000, -10000].sort((a, b) => a - b));
  });

  it("rechaza anular dos veces la misma transacción", async () => {
    const usuario = await prisma.usuario.create({
    data: { email: "doble@test.com", auth_user_id: "00000000-0000-4000-8000-000000000408", rol: "ADMIN" },
    });
    const original = await prisma.transaccion.create({
      data: { tipo: "EGRESO_OPERATIVO", caja_destino: "OPERATIVA", monto: -850000 },
    });

    await TransaccionesService.crearContraAsiento({
      id_txn_origen: original.id,
      comentario: "prueba",
      id_usuario_creador: usuario.id,
    });

    await assert.rejects(
      TransaccionesService.crearContraAsiento({
        id_txn_origen: original.id,
        comentario: "prueba 2",
        id_usuario_creador: usuario.id,
      }),
      /ya fue anulada/
    );

    const contraAsientos = await prisma.transaccion.findMany({
      where: { id_txn_origen: original.id, tipo: "CONTRA_ASIENTO" },
    });
    assert.equal(contraAsientos.length, 1, "no debe quedar un segundo contra-asiento");
  });

  it("rechaza anular dos veces una comisión que ya fue revertida en cascada", async () => {
    const usuario = await prisma.usuario.create({
    data: { email: "doble-cascada@test.com", auth_user_id: "00000000-0000-4000-8000-000000000409", rol: "ADMIN" },
    });
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño Doble Cascada", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle Doble Cascada 1", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino Doble Cascada", dni_cuit: "20444444444" },
    });

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
      monto_pagado: 600000,
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });
    const txnCobro = await prisma.transaccion.findFirstOrThrow({
      where: { id_contrato: contrato.id, tipo: "INGRESO_COBRO" },
    });
    const comision = await prisma.transaccion.findFirstOrThrow({
      where: { id_contrato: contrato.id, tipo: "INGRESO_COMISION" },
    });

    // Anular el cobro ya revierte la comisión en cascada.
    await TransaccionesService.crearContraAsiento({
      id_txn_origen: txnCobro.id,
      comentario: "cheque rechazado",
      id_usuario_creador: usuario.id,
    });

    // Intentar anular la comisión directamente después debe rechazarse.
    await assert.rejects(
      TransaccionesService.crearContraAsiento({
        id_txn_origen: comision.id,
        comentario: "intento manual sobre algo ya revertido",
        id_usuario_creador: usuario.id,
      }),
      /ya fue anulada/
    );
  });
});

describe("TransaccionesService.listar", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("filtra por tipo y por rango de fechas", async () => {
    await prisma.transaccion.create({
      data: {
        tipo: "INGRESO_COBRO",
        caja_destino: "TERCEROS",
        monto: 1000,
        fecha_transaccion: new Date("2026-01-01"),
      },
    });
    await prisma.transaccion.create({
      data: {
        tipo: "EGRESO_OPERATIVO",
        caja_destino: "OPERATIVA",
        monto: -500,
        fecha_transaccion: new Date("2026-06-01"),
      },
    });

    const soloIngresos = await TransaccionesService.listar({ tipo: "INGRESO_COBRO" });
    assert.equal(soloIngresos.length, 1);

    const enRango = await TransaccionesService.listar({
      desde: new Date("2026-05-01"),
      hasta: new Date("2026-07-01"),
    });
    assert.equal(enRango.length, 1);
    assert.equal(enRango[0].tipo, "EGRESO_OPERATIVO");
  });
});
