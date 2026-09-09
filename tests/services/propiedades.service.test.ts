import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import { PropiedadesService } from "@/services/propiedades.service";

async function crearPropiedadConContrato(estado: string | null) {
  const propietario = await prisma.propietario.create({
    data: { nombre: `Dueño ${estado ?? "sin contrato"}`, cbu: "0000000000000000000000" },
  });
  const propiedad = await prisma.propiedad.create({
    data: { id_propietario: propietario.id, direccion: `Calle ${estado ?? "libre"}`, es_propia: false },
  });

  if (estado) {
    const inquilino = await prisma.inquilino.create({
      data: { nombre: `Inquilino ${estado}`, dni_cuit: `20${Math.floor(Math.random() * 1e9)}` },
    });
    await prisma.contrato.create({
      data: {
        id_propiedad: propiedad.id,
        id_inquilino: inquilino.id,
        fecha_inicio: new Date("2026-01-01"),
        fecha_fin: new Date("2026-12-31"),
        monto_base: 100000,
        pct_comision: 10,
        estado: estado as never,
      },
    });
  }

  return propiedad;
}

describe("PropiedadesService.listarDisponibles", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("incluye propiedades sin ningún contrato", async () => {
    const propiedad = await crearPropiedadConContrato(null);
    const disponibles = await PropiedadesService.listarDisponibles();
    assert.ok(disponibles.some((p) => p.id === propiedad.id));
  });

  it("incluye propiedades cuyo único contrato está en BORRADOR", async () => {
    const propiedad = await crearPropiedadConContrato("BORRADOR");
    const disponibles = await PropiedadesService.listarDisponibles();
    assert.ok(disponibles.some((p) => p.id === propiedad.id));
  });

  it("excluye propiedades con un contrato ACTIVO", async () => {
    const propiedad = await crearPropiedadConContrato("ACTIVO");
    const disponibles = await PropiedadesService.listarDisponibles();
    assert.ok(!disponibles.some((p) => p.id === propiedad.id));
  });

  it("excluye propiedades con un contrato MOROSO", async () => {
    const propiedad = await crearPropiedadConContrato("MOROSO");
    const disponibles = await PropiedadesService.listarDisponibles();
    assert.ok(!disponibles.some((p) => p.id === propiedad.id));
  });

  it("incluye propiedades cuyo único contrato está VENCIDO o RESCINDIDO", async () => {
    const vencida = await crearPropiedadConContrato("VENCIDO");
    const rescindida = await crearPropiedadConContrato("RESCINDIDO");
    const disponibles = await PropiedadesService.listarDisponibles();
    assert.ok(disponibles.some((p) => p.id === vencida.id));
    assert.ok(disponibles.some((p) => p.id === rescindida.id));
  });
});
