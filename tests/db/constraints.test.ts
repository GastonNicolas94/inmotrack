import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";

describe("Constraints de integridad financiera", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("rechaza Gasto con id_propiedad null y cargo_a distinto de INMOBILIARIA", async () => {
    await assert.rejects(
      prisma.gasto.create({
        data: {
          id_propiedad: null,
          concepto: "Sueldo",
          monto: 100,
          tipo: "OTRO",
          cargo_a: "PROPIETARIO",
        },
      })
    );
  });

  it("rechaza UPDATE directo sobre transacciones", async () => {
    const txn = await prisma.transaccion.create({
      data: { tipo: "INGRESO_COBRO", caja_destino: "TERCEROS", monto: 100 },
    });

    await assert.rejects(
      prisma.$executeRawUnsafe(
        `UPDATE transacciones SET monto = 999 WHERE id = ${txn.id}`
      )
    );
  });

  it("un AplicacionPago requiere un Cargo existente (FK obligatoria)", async () => {
    await assert.rejects(
      prisma.aplicacionPago.create({
        data: {
          id_transaccion: 999999,
          id_cargo: 999999,
          monto_aplicado: 100,
        },
      })
    );
  });
});
