import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import { ContratosService } from "@/services/contratos.service";
import { CierrePeriodosService } from "@/services/cierre-periodos.service";
import { AjustesContratoService } from "@/services/ajustes-contrato.service";

const originalFechaSimulada = process.env.FECHA_SIMULADA;
const originalNodeEnv = process.env.NODE_ENV;

async function escenario() {
  const usuario = await prisma.usuario.create({
    data: {
      email: "worker-ajustes@inmotrack.test",
      auth_user_id: "33333333-3333-4333-8333-333333333333",
      rol: "EMPLEADO",
    },
  });
  const propietario = await prisma.propietario.create({
    data: { nombre: "Dueño Worker", cbu: "0000000000000000000000" },
  });
  const propiedad = await prisma.propiedad.create({
    data: { id_propietario: propietario.id, direccion: "Worker 123", es_propia: false },
  });
  const inquilino = await prisma.inquilino.create({
    data: { nombre: "Inquilino Worker", dni_cuit: "20999999993" },
  });
  const contrato = await ContratosService.crear({
    id_propiedad: propiedad.id,
    id_inquilino: inquilino.id,
    fecha_inicio: "2026-01-01",
    fecha_fin: "2027-12-31",
    monto_base: 500000,
    pct_comision: 10,
    pct_punitorio_diario: 0.1,
    indice_act: "ICL",
    meses_act: 3,
  });
  await ContratosService.activar(contrato.id, usuario.id);
  await prisma.outboxCierrePeriodo.create({
    data: { id_contrato: contrato.id, estado: "PENDIENTE" },
  });
  return { usuario, contrato };
}

describe("CierrePeriodosService con ajustes pendientes", () => {
  beforeEach(async () => {
    await cleanDatabase();
    process.env.NODE_ENV = "development";
    process.env.FECHA_SIMULADA = "2026-05-15";
  });

  afterEach(() => {
    if (originalFechaSimulada === undefined) delete process.env.FECHA_SIMULADA;
    else process.env.FECHA_SIMULADA = originalFechaSimulada;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it("se detiene en el primer ajuste y luego procesa exactamente la outbox reencolada", async () => {
    const { usuario, contrato } = await escenario();

    await CierrePeriodosService.procesarUnaFilaDeCola();

    const primeraFila = await prisma.outboxCierrePeriodo.findFirstOrThrow({
      where: { id_contrato: contrato.id },
      orderBy: { id: "asc" },
    });
    assert.equal(primeraFila.estado, "COMPLETADO");
    assert.equal(primeraFila.intentos, 0);

    const periodosAntes = await prisma.periodoPago.findMany({
      where: { id_contrato: contrato.id },
      orderBy: { periodo: "asc" },
    });
    assert.deepEqual(periodosAntes.map((p) => [p.periodo, p.estado_ciclo]), [
      ["2026-01", "CERRADO"],
      ["2026-02", "CERRADO"],
      ["2026-03", "ABIERTO"],
    ]);

    const ajuste = await prisma.ajusteContrato.findFirstOrThrow({
      where: { id_contrato: contrato.id, periodo_efectivo: "2026-04", estado: "PENDIENTE" },
    });
    const aplicado = await AjustesContratoService.aplicar(
      contrato.id,
      ajuste.id,
      { monto_nuevo: 600000, observacion: "Ajuste trimestral" },
      usuario.id,
    );

    assert.equal(await prisma.outboxCierrePeriodo.count({
      where: { id_contrato: contrato.id, estado: "PENDIENTE" },
    }), 1);

    const procesado = await CierrePeriodosService.procesarFilaDeCola(aplicado.outboxId);
    assert.equal(procesado.huboTrabajo, true);

    const duplicado = await CierrePeriodosService.procesarFilaDeCola(aplicado.outboxId);
    assert.equal(duplicado.huboTrabajo, false);

    const periodosDespues = await prisma.periodoPago.findMany({
      where: { id_contrato: contrato.id },
      include: { cargos: true },
      orderBy: { periodo: "asc" },
    });
    assert.deepEqual(periodosDespues.map((p) => [p.periodo, p.estado_ciclo]), [
      ["2026-01", "CERRADO"],
      ["2026-02", "CERRADO"],
      ["2026-03", "CERRADO"],
      ["2026-04", "CERRADO"],
      ["2026-05", "ABIERTO"],
    ]);
    assert.equal(Number(periodosDespues.find((p) => p.periodo === "2026-04")?.cargos.find((c) => c.tipo === "ALQUILER")?.monto), 600000);
    assert.equal(Number(periodosDespues.find((p) => p.periodo === "2026-05")?.cargos.find((c) => c.tipo === "ALQUILER")?.monto), 600000);
  });
});
