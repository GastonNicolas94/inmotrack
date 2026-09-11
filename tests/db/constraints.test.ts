import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import { createClient } from "@supabase/supabase-js";
import { readSupabasePublicEnv, readSupabaseSecret } from "@/lib/supabase/env";
import { requireSeedPassword } from "@/lib/seed-password";
import { assertLocalSupabaseUrl } from "@/lib/local-supabase-url";

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

  it("vincula un usuario de dominio a Auth y rechaza auth_user_id duplicado", async () => {
    const { url } = readSupabasePublicEnv();
    assertLocalSupabaseUrl(url);
    const admin = createClient(url, readSupabaseSecret(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const email = `auth-constraint-${crypto.randomUUID()}@example.invalid`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: requireSeedPassword(),
      email_confirm: true,
    });
    if (error) throw error;
    assert.ok(data.user);

    try {
      await prisma.usuario.create({
        data: { email, auth_user_id: data.user.id, rol: "ADMIN" },
      });

      await assert.rejects(
        prisma.usuario.create({
          data: {
            email: `auth-constraint-duplicate-${crypto.randomUUID()}@example.invalid`,
            auth_user_id: data.user.id,
            rol: "EMPLEADO",
          },
        })
      );
    } finally {
      await prisma.usuario.deleteMany({ where: { email } });
      const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
      if (deleteError) throw deleteError;
    }
  });
});
