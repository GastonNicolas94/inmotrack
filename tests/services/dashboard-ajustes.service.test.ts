import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import { parseDashboardFilters } from "@/lib/dashboard/filters";
import { createDashboardService } from "@/services/dashboard.service";

const now = new Date("2026-09-15T15:00:00.000Z");
const service = createDashboardService({ prisma, now: () => now });

async function crearContratoConAjuste(params: { propia: boolean; direccion: string }) {
  const propietario = await prisma.propietario.create({
    data: { nombre: `Dueño ${params.direccion}`, cbu: String(Math.floor(Math.random() * 1e21)).padStart(22, "0").slice(0, 22) },
  });
  const propiedad = await prisma.propiedad.create({
    data: { id_propietario: propietario.id, direccion: params.direccion, es_propia: params.propia },
  });
  const inquilino = await prisma.inquilino.create({
    data: { nombre: `Inquilino ${params.direccion}`, dni_cuit: `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(0, 20) },
  });
  const contrato = await prisma.contrato.create({
    data: {
      id_propiedad: propiedad.id,
      id_inquilino: inquilino.id,
      fecha_inicio: new Date("2026-01-01"),
      fecha_fin: new Date("2027-12-31"),
      estado: "ACTIVO",
      monto_base: 500000,
      pct_comision: 10,
      indice_act: "ICL",
      meses_act: 3,
    },
  });
  const ajuste = await prisma.ajusteContrato.create({
    data: {
      id_contrato: contrato.id,
      periodo_efectivo: "2026-10",
      indice: "ICL",
      monto_anterior: 500000,
    },
  });
  return { propiedad, contrato, ajuste };
}

describe("DashboardService ajustes pendientes", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("cuenta y expone como alerta solamente los ajustes pendientes", async () => {
    const pendiente = await crearContratoConAjuste({ propia: true, direccion: "Propia Ajuste" });
    const aplicado = await crearContratoConAjuste({ propia: false, direccion: "Terceros Aplicado" });
    await prisma.ajusteContrato.update({
      where: { id: aplicado.ajuste.id },
      data: { estado: "APLICADO", monto_nuevo: 600000, aplicado_en: new Date() },
    });

    const resultado = await service.getOperationalData(parseDashboardFilters({}, now));

    assert.equal(resultado.ajustesPendientes, 1);
    const alerta = resultado.alerts.find((item) => item.kind === "ajuste-pendiente");
    assert.ok(alerta);
    assert.equal(alerta.contractId, pendiente.contrato.id);
    assert.equal(alerta.href, "/contratos");
  });

  it("respeta los filtros de cartera al contar ajustes", async () => {
    await crearContratoConAjuste({ propia: true, direccion: "Propia" });
    await crearContratoConAjuste({ propia: false, direccion: "Terceros" });

    const propias = await service.getOperationalData(
      parseDashboardFilters({ cartera: "propias" }, now),
    );
    const terceros = await service.getOperationalData(
      parseDashboardFilters({ cartera: "terceros" }, now),
    );

    assert.equal(propias.ajustesPendientes, 1);
    assert.equal(terceros.ajustesPendientes, 1);
    assert.equal(propias.alerts.filter((item) => item.kind === "ajuste-pendiente").length, 1);
    assert.equal(terceros.alerts.filter((item) => item.kind === "ajuste-pendiente").length, 1);
  });
});
