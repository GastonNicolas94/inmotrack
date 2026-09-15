import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import { AjustesContratoService } from "@/services/ajustes-contrato.service";

async function crearEscenario() {
  const usuario = await prisma.usuario.create({
    data: {
      email: "operador-ajustes@inmotrack.test",
      auth_user_id: "11111111-1111-4111-8111-111111111111",
      rol: "EMPLEADO",
    },
  });
  const propietario = await prisma.propietario.create({
    data: { nombre: "Dueño Ajustes", cbu: "0000000000000000000000" },
  });
  const propiedad = await prisma.propiedad.create({
    data: { id_propietario: propietario.id, direccion: "Ajustes 123", es_propia: false },
  });
  const inquilino = await prisma.inquilino.create({
    data: { nombre: "Inquilino Ajustes", dni_cuit: "20999999991" },
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
  return { usuario, contrato };
}

describe("AjustesContratoService", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("crea una sola fila pendiente para contrato y período aunque se solicite dos veces", async () => {
    const { contrato } = await crearEscenario();

    const [primero, segundo] = await prisma.$transaction(async (tx) => {
      const contratoTx = await tx.contrato.findUniqueOrThrow({ where: { id: contrato.id } });
      const a = await AjustesContratoService.crearOReutilizarPendiente(tx, contratoTx, "2026-04");
      const b = await AjustesContratoService.crearOReutilizarPendiente(tx, contratoTx, "2026-04");
      return [a, b];
    });

    assert.equal(primero.id, segundo.id);
    assert.equal(primero.estado, "PENDIENTE");
    assert.equal(Number(primero.monto_anterior), 500000);
    assert.equal(await prisma.ajusteContrato.count(), 1);
  });

  it("aplica el nuevo monto y reencola el contrato en la misma operación", async () => {
    const { usuario, contrato } = await crearEscenario();
    const ajuste = await prisma.$transaction(async (tx) => {
      const contratoTx = await tx.contrato.findUniqueOrThrow({ where: { id: contrato.id } });
      return AjustesContratoService.crearOReutilizarPendiente(tx, contratoTx, "2026-04");
    });

    await AjustesContratoService.aplicar(
      contrato.id,
      ajuste.id,
      { monto_nuevo: 600000, observacion: "ICL trimestral" },
      usuario.id,
    );

    const actualizado = await prisma.contrato.findUniqueOrThrow({ where: { id: contrato.id } });
    const aplicado = await prisma.ajusteContrato.findUniqueOrThrow({ where: { id: ajuste.id } });
    const pendientesOutbox = await prisma.outboxCierrePeriodo.count({
      where: { id_contrato: contrato.id, estado: "PENDIENTE" },
    });

    assert.equal(Number(actualizado.monto_base), 600000);
    assert.equal(actualizado.fecha_ultimo_ajuste?.toISOString().slice(0, 10), "2026-04-01");
    assert.equal(aplicado.estado, "APLICADO");
    assert.equal(Number(aplicado.monto_nuevo), 600000);
    assert.equal(aplicado.id_usuario_aplicador, usuario.id);
    assert.ok(aplicado.aplicado_en);
    assert.equal(pendientesOutbox, 1);
  });

  it("rechaza aplicar dos veces el mismo ajuste", async () => {
    const { usuario, contrato } = await crearEscenario();
    const ajuste = await prisma.$transaction(async (tx) => {
      const contratoTx = await tx.contrato.findUniqueOrThrow({ where: { id: contrato.id } });
      return AjustesContratoService.crearOReutilizarPendiente(tx, contratoTx, "2026-04");
    });

    await AjustesContratoService.aplicar(contrato.id, ajuste.id, { monto_nuevo: 600000 }, usuario.id);

    await assert.rejects(
      () => AjustesContratoService.aplicar(contrato.id, ajuste.id, { monto_nuevo: 650000 }, usuario.id),
      /ya fue aplicado/i,
    );
  });
});
