import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import { PropiedadesService } from "@/services/propiedades.service";
import { ContratosService } from "@/services/contratos.service";
import { PagosService } from "@/services/pagos.service";
import { GastosService } from "@/services/gastos.service";
import { LiquidacionesService } from "@/services/liquidaciones.service";

function manana() {
  const fecha = new Date();
  fecha.setUTCDate(fecha.getUTCDate() + 1);
  return fecha;
}

async function crearEscenarioCompartido() {
  const ana = await prisma.propietario.create({
    data: { nombre: "Ana", cbu: "0000000000000000000001" },
  });
  const juan = await prisma.propietario.create({
    data: { nombre: "Juan", cbu: "0000000000000000000002" },
  });
  const propiedad = await PropiedadesService.crear({
    direccion: "Calle Compartida 100",
    es_propia: false,
    participaciones: [
      { id_propietario: ana.id, porcentaje: 60 },
      { id_propietario: juan.id, porcentaje: 40 },
    ],
  });
  const inquilino = await prisma.inquilino.create({
    data: { nombre: "Inquilino Compartido", dni_cuit: "20999999991" },
  });
  const usuario = await prisma.usuario.create({
    data: {
      email: `copropiedad-${crypto.randomUUID()}@test.com`,
      auth_user_id: crypto.randomUUID(),
      rol: "ADMIN",
    },
  });
  const contrato = await ContratosService.crear({
    id_propiedad: propiedad.id,
    id_inquilino: inquilino.id,
    fecha_inicio: "2026-08-01",
    fecha_fin: "2027-07-31",
    monto_base: 100000,
    pct_comision: 10,
    pct_punitorio_diario: 0.1,
  });
  await ContratosService.activar(contrato.id, usuario.id);

  return { ana, juan, propiedad, contrato, usuario };
}

describe("LiquidacionesService con copropiedad", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("prorratea cobro y comisión 60/40 en liquidaciones individuales", async () => {
    const { ana, juan, contrato, usuario } = await crearEscenarioCompartido();

    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 100000,
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });

    const liquidacionAna = await LiquidacionesService.generarParaPropietario(ana.id, manana());
    const liquidacionJuan = await LiquidacionesService.generarParaPropietario(juan.id, manana());

    assert.equal(Number(liquidacionAna.monto_bruto), 60000);
    assert.equal(Number(liquidacionAna.retenciones), 6000);
    assert.equal(Number(liquidacionAna.monto_neto), 54000);
    assert.equal(Number(liquidacionAna.items[0].porcentaje_participacion), 60);

    assert.equal(Number(liquidacionJuan.monto_bruto), 40000);
    assert.equal(Number(liquidacionJuan.retenciones), 4000);
    assert.equal(Number(liquidacionJuan.monto_neto), 36000);
    assert.equal(Number(liquidacionJuan.items[0].porcentaje_participacion), 40);

    const aplicacion = await prisma.aplicacionPago.findFirstOrThrow({
      where: { cargo: { tipo: "ALQUILER" } },
      include: { asignaciones: { orderBy: { id_propietario: "asc" } } },
    });

    assert.equal(
      aplicacion.id_liquidacion_item,
      null,
      "una fuente compartida no puede apuntar a una única liquidación",
    );
    assert.equal(aplicacion.asignaciones.length, 2);
    assert.ok(aplicacion.asignaciones.every((item) => item.id_liquidacion_item !== null));
  });

  it("prorratea gastos y conserva exactamente el total", async () => {
    const { ana, juan, propiedad } = await crearEscenarioCompartido();

    const gasto = await GastosService.crear({
      id_propiedad: propiedad.id,
      concepto: "Reparación compartida",
      monto: 10001,
      tipo: "ARREGLO",
      cargo_a: "PROPIETARIO",
    });

    const liquidacionAna = await LiquidacionesService.generarParaPropietario(ana.id, manana());
    const liquidacionJuan = await LiquidacionesService.generarParaPropietario(juan.id, manana());

    const gastoAna = liquidacionAna.items.find((item) => item.id_periodo === null);
    const gastoJuan = liquidacionJuan.items.find((item) => item.id_periodo === null);

    assert.equal(Number(gastoAna?.gastos), 6000.6);
    assert.equal(Number(gastoJuan?.gastos), 4000.4);
    assert.equal(Number(gastoAna?.gastos) + Number(gastoJuan?.gastos), 10001);

    const gastoPersistido = await prisma.gasto.findUniqueOrThrow({
      where: { id: gasto.id },
      include: { asignaciones: true },
    });
    assert.equal(gastoPersistido.id_liquidacion_item, null);
    assert.equal(gastoPersistido.asignaciones.length, 2);
  });

  it("congela el porcentaje cuando la primera liquidación snapshottea la fuente", async () => {
    const { ana, juan, propiedad, contrato, usuario } = await crearEscenarioCompartido();

    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 100000,
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });

    const liquidacionAna = await LiquidacionesService.generarParaPropietario(ana.id, manana());
    assert.equal(Number(liquidacionAna.monto_bruto), 60000);

    await PropiedadesService.actualizar(propiedad.id, {
      direccion: propiedad.direccion,
      es_propia: propiedad.es_propia,
      participaciones: [
        { id_propietario: ana.id, porcentaje: 50 },
        { id_propietario: juan.id, porcentaje: 50 },
      ],
    });

    const liquidacionJuan = await LiquidacionesService.generarParaPropietario(juan.id, manana());

    assert.equal(
      Number(liquidacionJuan.monto_bruto),
      40000,
      "la asignación ya creada debe conservar el 40% original",
    );
    assert.equal(Number(liquidacionJuan.items[0].porcentaje_participacion), 40);
  });

  it("el detalle individual muestra sólo el monto asignado al propietario", async () => {
    const { ana, contrato, usuario } = await crearEscenarioCompartido();

    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 100000,
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });

    const liquidacion = await LiquidacionesService.generarParaPropietario(ana.id, manana());
    const detalle = await LiquidacionesService.obtenerDetalle(liquidacion.id);

    assert.ok(detalle);
    assert.equal(Number(detalle.items[0].porcentaje_participacion), 60);
    assert.equal(Number(detalle.items[0].aplicaciones[0].monto_aplicado), 60000);
    assert.equal(Number(detalle.items[0].monto_bruto), 60000);
  });
  it("lista y permite liquidar un alquiler pendiente anterior al último corte", async () => {
    const { ana, contrato, usuario } = await crearEscenarioCompartido();

    const periodo = await prisma.periodoPago.findFirstOrThrow({
      where: { id_contrato: contrato.id },
    });
    const cargo = await prisma.cargo.findFirstOrThrow({
      where: { id_periodo: periodo.id, tipo: "ALQUILER" },
    });
    const fechaVieja = new Date();
    fechaVieja.setUTCDate(fechaVieja.getUTCDate() - 10);
    const transaccion = await prisma.transaccion.create({
      data: {
        tipo: "INGRESO_COBRO",
        caja_destino: "TERCEROS",
        monto: 100000,
        fecha_transaccion: fechaVieja,
        id_contrato: contrato.id,
        id_usuario_creador: usuario.id,
      },
    });
    const aplicacion = await prisma.aplicacionPago.create({
      data: {
        id_transaccion: transaccion.id,
        id_cargo: cargo.id,
        monto_aplicado: 100000,
      },
    });

    const ultimoCorte = new Date();
    ultimoCorte.setUTCDate(ultimoCorte.getUTCDate() - 5);
    await prisma.liquidacion.create({
      data: {
        id_propietario: ana.id,
        fecha_desde: new Date("2026-01-01"),
        fecha_hasta: ultimoCorte,
        monto_bruto: 0,
        retenciones: 0,
        monto_neto: 0,
      },
    });

    const pendientes = await LiquidacionesService.listarPendientes(ana.id, manana());
    const pendiente = pendientes.find(
      (item) => item.tipo === "ALQUILER" && item.id === aplicacion.id,
    );

    assert.ok(pendiente, "el alquiler viejo no liquidado debe seguir apareciendo como pendiente");
    assert.equal(Number(pendiente.monto), 60000);
    assert.equal(Number(pendiente.porcentaje_participacion), 60);

    const liquidacion = await LiquidacionesService.generarParaPropietario(
      ana.id,
      manana(),
      0,
      [{ tipo: "ALQUILER", id: aplicacion.id }],
    );

    assert.equal(Number(liquidacion.monto_bruto), 60000);
    const asignacion = await prisma.aplicacionPagoPropietario.findFirstOrThrow({
      where: { id_aplicacion_pago: aplicacion.id, id_propietario: ana.id },
    });
    assert.ok(asignacion.id_liquidacion_item !== null);
  });

  it("liquida sólo los conceptos seleccionados y deja el resto pendiente", async () => {
    const { ana, contrato, usuario } = await crearEscenarioCompartido();

    const periodo = await prisma.periodoPago.findFirstOrThrow({
      where: { id_contrato: contrato.id },
    });
    const cargo = await prisma.cargo.findFirstOrThrow({
      where: { id_periodo: periodo.id, tipo: "ALQUILER" },
    });

    const aplicaciones = [];
    for (const monto of [30000, 20000]) {
      const transaccion = await prisma.transaccion.create({
        data: {
          tipo: "INGRESO_COBRO",
          caja_destino: "TERCEROS",
          monto,
          id_contrato: contrato.id,
          id_usuario_creador: usuario.id,
        },
      });
      aplicaciones.push(
        await prisma.aplicacionPago.create({
          data: {
            id_transaccion: transaccion.id,
            id_cargo: cargo.id,
            monto_aplicado: monto,
          },
        }),
      );
    }

    const pendientes = await LiquidacionesService.listarPendientes(ana.id, manana());
    assert.equal(
      pendientes.filter((item) => item.tipo === "ALQUILER").length,
      2,
    );

    const liquidacion = await LiquidacionesService.generarParaPropietario(
      ana.id,
      manana(),
      0,
      [{ tipo: "ALQUILER", id: aplicaciones[0].id }],
    );

    assert.equal(Number(liquidacion.monto_bruto), 18000);

    const pendientesLuego = await LiquidacionesService.listarPendientes(ana.id, manana());
    assert.ok(
      pendientesLuego.some(
        (item) => item.tipo === "ALQUILER" && item.id === aplicaciones[1].id,
      ),
      "el concepto no seleccionado debe continuar pendiente",
    );
    assert.ok(
      !pendientesLuego.some(
        (item) => item.tipo === "ALQUILER" && item.id === aplicaciones[0].id,
      ),
      "el concepto seleccionado ya no debe aparecer como pendiente",
    );
  });

});
