import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import { ContratosService } from "@/services/contratos.service";
import { AjustesContratoService } from "@/services/ajustes-contrato.service";
import { calcularVencimientoPeriodo } from "@/lib/fecha";

async function escenarioTrimestral() {
  const usuario = await prisma.usuario.create({
    data: {
      email: "avance-ajustes@inmotrack.test",
      auth_user_id: "22222222-2222-4222-8222-222222222222",
      rol: "EMPLEADO",
    },
  });
  const propietario = await prisma.propietario.create({
    data: { nombre: "Dueño Avance", cbu: "0000000000000000000000" },
  });
  const propiedad = await prisma.propiedad.create({
    data: { id_propietario: propietario.id, direccion: "Avance 123", es_propia: false },
  });
  const inquilino = await prisma.inquilino.create({
    data: { nombre: "Inquilino Avance", dni_cuit: "20999999992" },
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
  return { usuario, contrato };
}

describe("ajustes al avanzar períodos", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("se detiene antes de abril, no cierra marzo y crea un ajuste pendiente", async () => {
    const { contrato } = await escenarioTrimestral();
    await ContratosService.avanzarPeriodo(contrato.id, "2026-02", calcularVencimientoPeriodo(2026, 2));
    await ContratosService.avanzarPeriodo(contrato.id, "2026-03", calcularVencimientoPeriodo(2026, 3));

    const resultado = await ContratosService.avanzarPeriodo(
      contrato.id,
      "2026-04",
      calcularVencimientoPeriodo(2026, 4),
    );

    assert.equal(resultado.estado, "AJUSTE_PENDIENTE");
    const marzo = await prisma.periodoPago.findUniqueOrThrow({
      where: { id_contrato_periodo: { id_contrato: contrato.id, periodo: "2026-03" } },
    });
    assert.equal(marzo.estado_ciclo, "ABIERTO");
    assert.equal(await prisma.periodoPago.count({ where: { id_contrato: contrato.id, periodo: "2026-04" } }), 0);
    assert.equal(await prisma.ajusteContrato.count({
      where: { id_contrato: contrato.id, periodo_efectivo: "2026-04", estado: "PENDIENTE" },
    }), 1);
  });

  it("tras aplicar el ajuste abre abril con el monto nuevo", async () => {
    const { usuario, contrato } = await escenarioTrimestral();
    await ContratosService.avanzarPeriodo(contrato.id, "2026-02", calcularVencimientoPeriodo(2026, 2));
    await ContratosService.avanzarPeriodo(contrato.id, "2026-03", calcularVencimientoPeriodo(2026, 3));
    const bloqueado = await ContratosService.avanzarPeriodo(
      contrato.id,
      "2026-04",
      calcularVencimientoPeriodo(2026, 4),
    );
    assert.equal(bloqueado.estado, "AJUSTE_PENDIENTE");
    if (bloqueado.estado !== "AJUSTE_PENDIENTE") throw new Error("esperaba ajuste pendiente");

    await AjustesContratoService.aplicar(
      contrato.id,
      bloqueado.ajusteId,
      { monto_nuevo: 600000 },
      usuario.id,
    );
    const avanzado = await ContratosService.avanzarPeriodo(
      contrato.id,
      "2026-04",
      calcularVencimientoPeriodo(2026, 4),
      usuario.id,
    );

    assert.equal(avanzado.estado, "AVANZADO");
    const abril = await prisma.periodoPago.findUniqueOrThrow({
      where: { id_contrato_periodo: { id_contrato: contrato.id, periodo: "2026-04" } },
      include: { cargos: true },
    });
    assert.equal(abril.estado_ciclo, "ABIERTO");
    assert.equal(Number(abril.cargos.find((c) => c.tipo === "ALQUILER")?.monto), 600000);
  });
});
