import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import { CierrePeriodosService } from "@/services/cierre-periodos.service";
import { ContratosService } from "@/services/contratos.service";
import { hoyEnArgentina } from "@/lib/fecha";

async function crearContratoConPeriodo(estadoContrato: string, periodo: string, estadoCiclo: string) {
  const propietario = await prisma.propietario.create({
    data: { nombre: `Dueño ${periodo}-${estadoContrato}-${Math.random()}`, cbu: "0000000000000000000000" },
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
      fecha_inicio: new Date("2026-01-01"),
      fecha_fin: new Date("2027-12-31"),
      monto_base: 300000,
      pct_comision: 10,
      estado: estadoContrato as never,
    },
  });
  await prisma.periodoPago.create({
    data: {
      id_contrato: contrato.id,
      periodo,
      fecha_vencimiento: new Date("2026-01-10"),
      estado_ciclo: estadoCiclo as never,
    },
  });
  return contrato;
}

describe("CierrePeriodosService.encolarContratosVencidos", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("encola un contrato ACTIVO cuyo período abierto ya terminó su mes", async () => {
    const contrato = await crearContratoConPeriodo("ACTIVO", "2026-01", "ABIERTO");

    const { encolados } = await CierrePeriodosService.encolarContratosVencidos();

    assert.equal(encolados, 1);
    const fila = await prisma.outboxCierrePeriodo.findFirst({ where: { id_contrato: contrato.id } });
    assert.ok(fila, "debe existir una fila en la cola para este contrato");
    assert.equal(fila?.estado, "PENDIENTE");
  });

  it("encola un contrato MOROSO igual que uno ACTIVO", async () => {
    await crearContratoConPeriodo("MOROSO", "2026-01", "ABIERTO");
    const { encolados } = await CierrePeriodosService.encolarContratosVencidos();
    assert.equal(encolados, 1);
  });

  it("no encola un contrato BORRADOR", async () => {
    await crearContratoConPeriodo("BORRADOR", "2026-01", "ABIERTO");
    const { encolados } = await CierrePeriodosService.encolarContratosVencidos();
    assert.equal(encolados, 0);
  });

  it("no encola un contrato cuyo período abierto es el del mes actual (no venció todavía)", async () => {
    const { anio, mes } = hoyEnArgentina();
    const periodoActual = `${anio}-${String(mes).padStart(2, "0")}`;
    await crearContratoConPeriodo("ACTIVO", periodoActual, "ABIERTO");

    const { encolados } = await CierrePeriodosService.encolarContratosVencidos();
    assert.equal(encolados, 0);
  });

  it("no duplica una fila si el contrato ya tiene una PENDIENTE sin resolver", async () => {
    const contrato = await crearContratoConPeriodo("ACTIVO", "2026-01", "ABIERTO");

    await CierrePeriodosService.encolarContratosVencidos();
    const { encolados: segundaVez } = await CierrePeriodosService.encolarContratosVencidos();

    assert.equal(segundaVez, 0);
    const filas = await prisma.outboxCierrePeriodo.findMany({ where: { id_contrato: contrato.id } });
    assert.equal(filas.length, 1);
  });

  it("sí encola de nuevo un contrato cuya fila anterior ya está COMPLETADO", async () => {
    const contrato = await crearContratoConPeriodo("ACTIVO", "2026-01", "ABIERTO");
    await prisma.outboxCierrePeriodo.create({
      data: { id_contrato: contrato.id, estado: "COMPLETADO", procesado_en: new Date() },
    });

    const { encolados } = await CierrePeriodosService.encolarContratosVencidos();
    assert.equal(encolados, 1);
  });

  it("sí encola de nuevo un contrato cuya fila anterior quedó atascada en PROCESANDO", async () => {
    // Regresión: una fila PROCESANDO puede quedar atascada para siempre
    // (la función que la reclama se cae a mitad de camino) — no debe
    // bloquear el reencolado de ese contrato en las corridas siguientes.
    const contrato = await crearContratoConPeriodo("ACTIVO", "2026-01", "ABIERTO");
    await prisma.outboxCierrePeriodo.create({
      data: { id_contrato: contrato.id, estado: "PROCESANDO" },
    });

    const { encolados } = await CierrePeriodosService.encolarContratosVencidos();
    assert.equal(encolados, 1);
  });

  it("transiciona a VENCIDO (sin encolar) un contrato cuya fecha_fin ya pasó", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño Contrato Vencido", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle Contrato Vencido", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino Contrato Vencido", dni_cuit: "20666666667" },
    });
    // fecha_fin en el pasado respecto a cualquier "hoy" real de esta sesión.
    const contrato = await prisma.contrato.create({
      data: {
        id_propiedad: propiedad.id,
        id_inquilino: inquilino.id,
        fecha_inicio: new Date("2020-01-01"),
        fecha_fin: new Date("2020-12-31"),
        monto_base: 300000,
        pct_comision: 10,
        estado: "ACTIVO",
      },
    });
    await prisma.periodoPago.create({
      data: {
        id_contrato: contrato.id,
        periodo: "2020-12",
        fecha_vencimiento: new Date("2020-12-10"),
        estado_ciclo: "ABIERTO",
      },
    });

    const { encolados, vencidos } = await CierrePeriodosService.encolarContratosVencidos();

    assert.equal(vencidos, 1);
    assert.equal(encolados, 0);
    const contratoActualizado = await prisma.contrato.findUnique({ where: { id: contrato.id } });
    assert.equal(contratoActualizado?.estado, "VENCIDO");
    // No se generó ninguna fila de cola ni se tocó el período — se dejó
    // tal cual, visible para revisión manual.
    const filas = await prisma.outboxCierrePeriodo.findMany({ where: { id_contrato: contrato.id } });
    assert.equal(filas.length, 0);
    const periodo = await prisma.periodoPago.findFirst({ where: { id_contrato: contrato.id } });
    assert.equal(periodo?.estado_ciclo, "ABIERTO");
  });

  it("NO transiciona a VENCIDO un contrato cuya fecha_fin es exactamente hoy (último día sigue vigente)", async () => {
    // Fechas relativas a hoyEnArgentina() a propósito, sin años hardcodeados
    // — el otro test de VENCIDO usa 2020 y no le importa el paso del
    // tiempo, pero éste prueba el borde exacto (finStr < hoyStr, no <=),
    // así que "hoy" tiene que ser el hoy real de la corrida.
    const { anio, mes, dia } = hoyEnArgentina();
    const hoy = new Date(Date.UTC(anio, mes - 1, dia));
    const mesAnterior = new Date(Date.UTC(anio, mes - 2, 1));
    const periodoAnterior = `${mesAnterior.getUTCFullYear()}-${String(mesAnterior.getUTCMonth() + 1).padStart(2, "0")}`;

    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño Vence Hoy", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle Vence Hoy", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino Vence Hoy", dni_cuit: "20666666669" },
    });
    const contrato = await prisma.contrato.create({
      data: {
        id_propiedad: propiedad.id,
        id_inquilino: inquilino.id,
        fecha_inicio: new Date(Date.UTC(anio - 1, 0, 1)),
        fecha_fin: hoy,
        monto_base: 300000,
        pct_comision: 10,
        estado: "ACTIVO",
      },
    });
    await prisma.periodoPago.create({
      data: {
        id_contrato: contrato.id,
        periodo: periodoAnterior,
        fecha_vencimiento: new Date(Date.UTC(mesAnterior.getUTCFullYear(), mesAnterior.getUTCMonth(), 10)),
        estado_ciclo: "ABIERTO",
      },
    });

    const { encolados, vencidos } = await CierrePeriodosService.encolarContratosVencidos();

    assert.equal(vencidos, 0);
    assert.equal(encolados, 1);
    const contratoActualizado = await prisma.contrato.findUnique({ where: { id: contrato.id } });
    assert.equal(contratoActualizado?.estado, "ACTIVO");
  });
});

describe("CierrePeriodosService.procesarUnaFilaDeCola", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("devuelve huboTrabajo: false si no hay ninguna fila PENDIENTE", async () => {
    const resultado = await CierrePeriodosService.procesarUnaFilaDeCola();
    assert.equal(resultado.huboTrabajo, false);
  });

  it("avanza el período de un contrato con un solo mes de atraso, y marca la fila COMPLETADO", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño Cola 1", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle Cola 1", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino Cola 1", dni_cuit: "20666666661" },
    });
    const contrato = await ContratosService.crear({
      id_propiedad: propiedad.id,
      id_inquilino: inquilino.id,
      fecha_inicio: "2026-01-01",
      fecha_fin: "2027-12-31",
      monto_base: 300000,
      pct_comision: 10,
      pct_punitorio_diario: 0.1,
    });
    await ContratosService.activar(contrato.id);
    // El período nace en 2026-01 (por fecha_inicio) — lo dejamos así, un
    // mes atrasado respecto a cualquier "hoy" real de esta sesión.
    const fila = await prisma.outboxCierrePeriodo.create({
      data: { id_contrato: contrato.id, estado: "PENDIENTE" },
    });

    const resultado = await CierrePeriodosService.procesarUnaFilaDeCola();

    assert.equal(resultado.huboTrabajo, true);
    const filaActualizada = await prisma.outboxCierrePeriodo.findUnique({ where: { id: fila.id } });
    assert.equal(filaActualizada?.estado, "COMPLETADO");
    assert.ok(filaActualizada?.procesado_en);

    const periodoAbiertoFinal = await prisma.periodoPago.findFirst({
      where: { id_contrato: contrato.id, estado_ciclo: "ABIERTO" },
    });
    const { anio, mes } = hoyEnArgentina();
    const mesActual = `${anio}-${String(mes).padStart(2, "0")}`;
    assert.ok(
      periodoAbiertoFinal!.periodo >= mesActual,
      "el período abierto final debe estar al día (no antes del mes actual)"
    );

    const periodoEnero = await prisma.periodoPago.findFirst({
      where: { id_contrato: contrato.id, periodo: "2026-01" },
    });
    assert.equal(periodoEnero?.estado_ciclo, "CERRADO");
  });

  it("marca COMPLETADO sin llamar avanzarPeriodo si el contrato ya está al día (doble chequeo)", async () => {
    const { anio, mes } = hoyEnArgentina();
    const mesActual = `${anio}-${String(mes).padStart(2, "0")}`;

    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño Cola 2", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle Cola 2", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino Cola 2", dni_cuit: "20666666662" },
    });
    const contrato = await prisma.contrato.create({
      data: {
        id_propiedad: propiedad.id,
        id_inquilino: inquilino.id,
        fecha_inicio: new Date("2026-01-01"),
        fecha_fin: new Date("2027-12-31"),
        monto_base: 300000,
        pct_comision: 10,
        estado: "ACTIVO",
      },
    });
    await prisma.periodoPago.create({
      data: {
        id_contrato: contrato.id,
        periodo: mesActual,
        fecha_vencimiento: new Date("2026-01-10"),
        estado_ciclo: "ABIERTO",
      },
    });
    const fila = await prisma.outboxCierrePeriodo.create({
      data: { id_contrato: contrato.id, estado: "PENDIENTE" },
    });

    await CierrePeriodosService.procesarUnaFilaDeCola();

    const filaActualizada = await prisma.outboxCierrePeriodo.findUnique({ where: { id: fila.id } });
    assert.equal(filaActualizada?.estado, "COMPLETADO");
    // Sigue habiendo un solo período — no se creó ninguno nuevo.
    const periodos = await prisma.periodoPago.count({ where: { id_contrato: contrato.id } });
    assert.equal(periodos, 1);
  });

  it("reintenta hasta 3 veces y después marca ERROR, sin bloquear otras filas", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño Cola Error", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle Cola Error", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino Cola Error", dni_cuit: "20666666664" },
    });
    const contrato = await prisma.contrato.create({
      data: {
        id_propiedad: propiedad.id,
        id_inquilino: inquilino.id,
        fecha_inicio: new Date("2026-01-01"),
        fecha_fin: new Date("2027-12-31"),
        monto_base: 300000,
        pct_comision: 10,
        estado: "ACTIVO",
      },
    });
    await prisma.periodoPago.create({
      data: {
        id_contrato: contrato.id,
        periodo: "2026-01",
        fecha_vencimiento: new Date("2026-01-10"),
        estado_ciclo: "ABIERTO",
      },
    });
    // Pre-creamos el período "siguiente" (2026-02) ya existente para este
    // contrato — cuando avanzarPeriodo intente abrirlo vía abrirPeriodo(),
    // choca contra @@unique([id_contrato, periodo]) en PeriodoPago y tira
    // un error real dentro de la transacción (rollback completo, incluido
    // el cierre de 2026-01), sin depender de una FK inválida en el fixture.
    await prisma.periodoPago.create({
      data: {
        id_contrato: contrato.id,
        periodo: "2026-02",
        fecha_vencimiento: new Date("2026-02-10"),
        estado_ciclo: "CERRADO",
      },
    });
    const filaConError = await prisma.outboxCierrePeriodo.create({
      data: { id_contrato: contrato.id, estado: "PENDIENTE" },
    });

    await CierrePeriodosService.procesarUnaFilaDeCola();
    let fila = await prisma.outboxCierrePeriodo.findUnique({ where: { id: filaConError.id } });
    assert.equal(fila?.estado, "PENDIENTE");
    assert.equal(fila?.intentos, 1);

    await CierrePeriodosService.procesarUnaFilaDeCola();
    fila = await prisma.outboxCierrePeriodo.findUnique({ where: { id: filaConError.id } });
    assert.equal(fila?.estado, "PENDIENTE");
    assert.equal(fila?.intentos, 2);

    await CierrePeriodosService.procesarUnaFilaDeCola();
    fila = await prisma.outboxCierrePeriodo.findUnique({ where: { id: filaConError.id } });
    assert.equal(fila?.estado, "ERROR");
    assert.equal(fila?.intentos, 3);
    assert.ok(fila?.error);
  });

  it("toma siempre la fila PENDIENTE más vieja primero", async () => {
    // Fila vieja: contrato real con una colisión de período forzada (igual
    // técnica que el test anterior) — al procesarse debe fallar (intentos
    // incrementa a 1), no tener éxito, pero SÍ debe ser la elegida primero.
    const propietarioVieja = await prisma.propietario.create({
      data: { nombre: "Dueño Cola Orden Vieja", cbu: "0000000000000000000000" },
    });
    const propiedadVieja = await prisma.propiedad.create({
      data: { id_propietario: propietarioVieja.id, direccion: "Calle Cola Orden Vieja", es_propia: false },
    });
    const inquilinoVieja = await prisma.inquilino.create({
      data: { nombre: "Inquilino Cola Orden Vieja", dni_cuit: "20666666665" },
    });
    const contratoVieja = await prisma.contrato.create({
      data: {
        id_propiedad: propiedadVieja.id,
        id_inquilino: inquilinoVieja.id,
        fecha_inicio: new Date("2026-01-01"),
        fecha_fin: new Date("2027-12-31"),
        monto_base: 300000,
        pct_comision: 10,
        estado: "ACTIVO",
      },
    });
    await prisma.periodoPago.create({
      data: {
        id_contrato: contratoVieja.id,
        periodo: "2026-01",
        fecha_vencimiento: new Date("2026-01-10"),
        estado_ciclo: "ABIERTO",
      },
    });
    await prisma.periodoPago.create({
      data: {
        id_contrato: contratoVieja.id,
        periodo: "2026-02",
        fecha_vencimiento: new Date("2026-02-10"),
        estado_ciclo: "CERRADO",
      },
    });

    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño Cola Orden", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle Cola Orden", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino Cola Orden", dni_cuit: "20666666663" },
    });
    const contrato = await prisma.contrato.create({
      data: {
        id_propiedad: propiedad.id,
        id_inquilino: inquilino.id,
        fecha_inicio: new Date("2026-01-01"),
        fecha_fin: new Date("2027-12-31"),
        monto_base: 300000,
        pct_comision: 10,
        estado: "ACTIVO",
      },
    });
    const { anio, mes } = hoyEnArgentina();
    const mesActual = `${anio}-${String(mes).padStart(2, "0")}`;
    await prisma.periodoPago.create({
      data: {
        id_contrato: contrato.id,
        periodo: mesActual,
        fecha_vencimiento: new Date("2026-01-10"),
        estado_ciclo: "ABIERTO",
      },
    });

    const filaVieja = await prisma.outboxCierrePeriodo.create({
      data: { id_contrato: contratoVieja.id, estado: "PENDIENTE" },
    });
    // Forzar que la primera quede con creado_en más viejo.
    await new Promise((r) => setTimeout(r, 5));
    await prisma.outboxCierrePeriodo.create({
      data: { id_contrato: contrato.id, estado: "PENDIENTE" },
    });

    await CierrePeriodosService.procesarUnaFilaDeCola();

    const filaViejaActualizada = await prisma.outboxCierrePeriodo.findUnique({
      where: { id: filaVieja.id },
    });
    // La más vieja (la que colisiona y falla) se procesó primero — quedó
    // reintentando, no la otra fila (que sigue PENDIENTE sin tocar).
    assert.equal(filaViejaActualizada?.intentos, 1);
  });

  it("no avanza el período de un contrato que pasó a RESCINDIDO entre que se encoló y se procesó", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño Cola Rescindido", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle Cola Rescindido", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino Cola Rescindido", dni_cuit: "20666666666" },
    });
    const contrato = await prisma.contrato.create({
      data: {
        id_propiedad: propiedad.id,
        id_inquilino: inquilino.id,
        fecha_inicio: new Date("2026-01-01"),
        fecha_fin: new Date("2027-12-31"),
        monto_base: 300000,
        pct_comision: 10,
        estado: "ACTIVO",
      },
    });
    await prisma.periodoPago.create({
      data: {
        id_contrato: contrato.id,
        periodo: "2026-01",
        fecha_vencimiento: new Date("2026-01-10"),
        estado_ciclo: "ABIERTO",
      },
    });
    const fila = await prisma.outboxCierrePeriodo.create({
      data: { id_contrato: contrato.id, estado: "PENDIENTE" },
    });

    // El contrato pasa a RESCINDIDO DESPUÉS de encolarse, ANTES de procesarse.
    await prisma.contrato.update({ where: { id: contrato.id }, data: { estado: "RESCINDIDO" } });

    const resultado = await CierrePeriodosService.procesarUnaFilaDeCola();

    assert.equal(resultado.huboTrabajo, true);
    const filaActualizada = await prisma.outboxCierrePeriodo.findUnique({ where: { id: fila.id } });
    assert.equal(filaActualizada?.estado, "COMPLETADO");

    // El período NO avanzó — sigue siendo el mismo, ABIERTO, sin cargos nuevos.
    const periodos = await prisma.periodoPago.findMany({ where: { id_contrato: contrato.id } });
    assert.equal(periodos.length, 1);
    assert.equal(periodos[0].periodo, "2026-01");
    assert.equal(periodos[0].estado_ciclo, "ABIERTO");
  });
});
