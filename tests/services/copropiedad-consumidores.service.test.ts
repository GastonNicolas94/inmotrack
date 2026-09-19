import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import { ContratosService } from "@/services/contratos.service";
import { PropiedadesService } from "@/services/propiedades.service";
import { PropietariosService } from "@/services/propietarios.service";

describe("consumidores de copropiedad", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("un contrato se encuentra filtrando por cualquiera de sus copropietarios", async () => {
    const [ana, juan] = await Promise.all([
      prisma.propietario.create({
        data: { nombre: "Ana", cbu: "0000000000000000000001" },
      }),
      prisma.propietario.create({
        data: { nombre: "Juan", cbu: "0000000000000000000002" },
      }),
    ]);
    const propiedad = await PropiedadesService.crear({
      direccion: "Calle Compartida 123",
      es_propia: false,
      participaciones: [
        { id_propietario: ana.id, porcentaje: 60 },
        { id_propietario: juan.id, porcentaje: 40 },
      ],
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino", dni_cuit: "20123456789" },
    });
    const contrato = await ContratosService.crear({
      id_propiedad: propiedad.id,
      id_inquilino: inquilino.id,
      fecha_inicio: "2026-01-01",
      fecha_fin: "2026-12-31",
      monto_base: 500000,
      pct_comision: 10,
      pct_punitorio_diario: 0.1,
    });

    const contratosAna = await ContratosService.listar({ id_propietario: ana.id });
    const contratosJuan = await ContratosService.listar({ id_propietario: juan.id });

    assert.deepEqual(contratosAna.map((item) => item.id), [contrato.id]);
    assert.deepEqual(contratosJuan.map((item) => item.id), [contrato.id]);
  });

  it("cuenta una propiedad compartida para cada propietario", async () => {
    const [ana, juan] = await Promise.all([
      prisma.propietario.create({
        data: { nombre: "Ana", cbu: "0000000000000000000001" },
      }),
      prisma.propietario.create({
        data: { nombre: "Juan", cbu: "0000000000000000000002" },
      }),
    ]);
    await PropiedadesService.crear({
      direccion: "Calle Compartida 456",
      es_propia: false,
      participaciones: [
        { id_propietario: ana.id, porcentaje: 50 },
        { id_propietario: juan.id, porcentaje: 50 },
      ],
    });

    const propietarios = await PropietariosService.listar();
    const porId = new Map(propietarios.map((item) => [item.id, item]));

    assert.equal(porId.get(ana.id)?._count.participaciones, 1);
    assert.equal(porId.get(juan.id)?._count.participaciones, 1);
  });
});
