import test from "node:test";
import assert from "node:assert/strict";
import {
  createAuthContextDependencies,
  getAuthenticatedUser,
  requireAdmin,
  requireDashboardUser,
  requireAuthenticatedUser,
} from "../../lib/auth-context.ts";
import { HttpError } from "../../lib/http-error.ts";
import { handleServiceError } from "../../lib/api-error-handler.ts";

type ClaimsResult = { data: { claims: { sub?: string } | null }; error: unknown };
type Profile = {
  id: number;
  auth_user_id: string;
  email: string;
  rol: "ADMIN" | "EMPLEADO" | "AUDITOR";
  puede_aprobar_liquidaciones: boolean;
  id_propietario: number | null;
};

function dependencies(claims: ClaimsResult, profile: Profile | null) {
  return {
    getClaims: async () => claims,
    findProfile: async (authUserId: string) => {
      assert.equal(authUserId, claims.data.claims?.sub);
      return profile;
    },
  };
}

test("returns null when Supabase cannot validate identity", async () => {
  const user = await getAuthenticatedUser(
    dependencies({ data: { claims: null }, error: new Error("expired") }, null),
  );
  assert.equal(user, null);
});

test("default dependency composition fails closed outside a request scope", async () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  try {
    assert.equal(await getAuthenticatedUser(), null);
  } finally {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

test("composes server identity and Prisma profile dependencies", async () => {
  const dependencies = createAuthContextDependencies({
    createServerSupabaseClient: async () => ({
      auth: {
        getClaims: async () => ({ data: { claims: { sub: "auth-composed" } }, error: null }),
      },
    }),
    prisma: {
      usuario: {
        findUnique: async ({ where }) => ({
          id: 21,
          auth_user_id: where.auth_user_id,
          email: "composed@example.com",
          rol: "AUDITOR" as const,
          puede_aprobar_liquidaciones: false,
          id_propietario: null,
        }),
      },
    },
  });
  assert.equal((await getAuthenticatedUser(dependencies))?.email, "composed@example.com");
});

test("returns null when validated claims do not contain a subject", async () => {
  const user = await getAuthenticatedUser(
    dependencies({ data: { claims: {} }, error: null }, null),
  );
  assert.equal(user, null);
});

test("returns null when identity has no domain profile", async () => {
  const user = await getAuthenticatedUser(
    dependencies({ data: { claims: { sub: "auth-1" } }, error: null }, null),
  );
  assert.equal(user, null);
});

test("maps every profile field and preserves delegated approval", async () => {
  const profile: Profile = {
    id: 7,
    auth_user_id: "auth-1",
    email: "employee@example.com",
    rol: "EMPLEADO",
    puede_aprobar_liquidaciones: true,
    id_propietario: 12,
  };
  const user = await getAuthenticatedUser(
    dependencies({ data: { claims: { sub: "auth-1" } }, error: null }, profile),
  );
  assert.deepEqual(user, {
    id: 7,
    authUserId: "auth-1",
    email: "employee@example.com",
    rol: "EMPLEADO",
    puedeAprobarLiquidaciones: true,
    idPropietario: 12,
  });
});

test("returns ADMIN and AUDITOR profiles without changing their roles", async () => {
  for (const rol of ["ADMIN", "AUDITOR"] as const) {
    const profile: Profile = {
      id: 8,
      auth_user_id: `auth-${rol}`,
      email: `${rol.toLowerCase()}@example.com`,
      rol,
      puede_aprobar_liquidaciones: false,
      id_propietario: null,
    };
    const user = await getAuthenticatedUser(
      dependencies({ data: { claims: { sub: profile.auth_user_id } }, error: null }, profile),
    );
    assert.equal(user?.rol, rol);
  }
});

test("requires an authenticated profile", async () => {
  await assert.rejects(
    () => requireAuthenticatedUser(dependencies({ data: { claims: null }, error: null }, null)),
    (error: unknown) =>
      error instanceof HttpError &&
      error.code === "UNAUTHORIZED" &&
      error.status === 401 &&
      error.message === "No autenticado.",
  );
});

test("requires ADMIN role and allows an ADMIN profile", async () => {
  const profile: Profile = {
    id: 1,
    auth_user_id: "admin-auth",
    email: "admin@example.com",
    rol: "ADMIN",
    puede_aprobar_liquidaciones: false,
    id_propietario: null,
  };
  const user = await requireAdmin(
    dependencies({ data: { claims: { sub: profile.auth_user_id } }, error: null }, profile),
  );
  assert.equal(user.rol, "ADMIN");
});

test("rejects non-ADMIN roles from admin-only operations", async () => {
  const profile: Profile = {
    id: 2,
    auth_user_id: "employee-auth",
    email: "employee@example.com",
    rol: "EMPLEADO",
    puede_aprobar_liquidaciones: true,
    id_propietario: null,
  };
  await assert.rejects(
    () => requireAdmin(dependencies({ data: { claims: { sub: profile.auth_user_id } }, error: null }, profile)),
    (error: unknown) =>
      error instanceof HttpError && error.code === "FORBIDDEN" && error.status === 403,
  );
});

test("allows the dashboard gate to return an authenticated user", async () => {
  const profile: Profile = {
    id: 3,
    auth_user_id: "dashboard-auth",
    email: "dashboard@example.com",
    rol: "EMPLEADO",
    puede_aprobar_liquidaciones: false,
    id_propietario: null,
  };
  const user = await requireDashboardUser(
    () => {
      throw new Error("should not redirect") as never;
    },
    dependencies({ data: { claims: { sub: profile.auth_user_id } }, error: null }, profile),
  );
  assert.equal(user.id, 3);
});

test("redirects only an unauthenticated dashboard request", async () => {
  const redirectError = new Error("redirected");
  let path = "";
  await assert.rejects(
    () =>
      requireDashboardUser(
        (destination) => {
          path = destination;
          throw redirectError;
        },
        dependencies({ data: { claims: null }, error: null }, null),
      ),
    (error: unknown) => error === redirectError,
  );
  assert.equal(path, "/login");
});

test("propagates non-authentication errors from the dashboard gate", async () => {
  const databaseError = new Error("database unavailable");
  await assert.rejects(
    () =>
      requireDashboardUser(
        () => {
          throw new Error("should not redirect") as never;
        },
        {
          getClaims: async () => ({ data: { claims: { sub: "auth-db-error" } }, error: null }),
          findProfile: async () => {
            throw databaseError;
          },
        },
      ),
    (error: unknown) => error === databaseError,
  );
});

test("maps HttpError before generic service errors", async () => {
  const response = handleServiceError(new HttpError("FORBIDDEN", "Acceso denegado.", 403));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error_code: "FORBIDDEN",
    message: "Acceso denegado.",
  });
});
