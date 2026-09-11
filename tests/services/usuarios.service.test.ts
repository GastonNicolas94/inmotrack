import test from "node:test";
import assert from "node:assert/strict";
import { HttpError } from "../../lib/http-error.ts";
import {
  createUsuariosService,
  UsuariosService,
  type UsuariosServiceDependencies,
} from "../../services/usuarios.service.ts";

const adminActor = {
  id: 1,
  authUserId: "actor-auth",
  email: "admin@example.com",
  rol: "ADMIN" as const,
  puedeAprobarLiquidaciones: false,
  idPropietario: null,
};

const inviteInput = {
  email: "new@example.com",
  rol: "EMPLEADO" as const,
  puede_aprobar_liquidaciones: true,
  id_propietario: null,
};

function dependencies(overrides: Partial<UsuariosServiceDependencies> = {}) {
  const calls: string[] = [];
  const deps: UsuariosServiceDependencies = {
    appUrl: "https://app.example.com",
    admin: {
      auth: {
        admin: {
          async inviteUserByEmail(email, options) {
            calls.push(`invite:${email}:${options.redirectTo}`);
            return { data: { user: { id: "auth-new" } }, error: null };
          },
          async deleteUser(id) {
            calls.push(`delete:${id}`);
            return { error: null };
          },
        },
      },
    },
    prisma: {
      usuario: {
        async create(args) {
          calls.push(`profile:${args.data.email}`);
          return {
            id: 7,
            email: args.data.email,
            rol: args.data.rol,
            puede_aprobar_liquidaciones: args.data.puede_aprobar_liquidaciones,
            id_propietario: args.data.id_propietario,
          };
        },
        async findMany() {
          return [
            { id: 7, email: "auditor@example.com", rol: "AUDITOR" as const, puede_aprobar_liquidaciones: false },
          ];
        },
      },
    },
    ...overrides,
  };
  return { deps, calls };
}

test("invitar creates the profile and redirects the invite to confirm", async () => {
  const { deps, calls } = dependencies();
  const result = await createUsuariosService(deps).invitar(inviteInput, adminActor);

  assert.deepEqual(result, {
    id: 7,
    email: "new@example.com",
    rol: "EMPLEADO",
    puede_aprobar_liquidaciones: true,
    id_propietario: null,
  });
  assert.deepEqual(calls, [
    "invite:new@example.com:https://app.example.com/auth/confirm",
    "profile:new@example.com",
  ]);
});

test("invitar revalidates that the actor is ADMIN", async () => {
  const { deps, calls } = dependencies();
  await assert.rejects(
    createUsuariosService(deps).invitar(inviteInput, { ...adminActor, rol: "EMPLEADO" }),
    (error: unknown) => error instanceof HttpError && error.code === "FORBIDDEN" && error.status === 403,
  );
  assert.deepEqual(calls, []);
});

test("invitar rejects invalid role and approval combinations through Zod", async () => {
  const { deps, calls } = dependencies();
  await assert.rejects(
    createUsuariosService(deps).invitar({ ...inviteInput, rol: "OWNER" }, adminActor),
    (error: unknown) => error instanceof HttpError && error.code === "VALIDATION_ERROR" && error.status === 400,
  );
  await assert.rejects(
    createUsuariosService(deps).invitar({ ...inviteInput, rol: "AUDITOR" }, adminActor),
    (error: unknown) => error instanceof HttpError && error.code === "VALIDATION_ERROR" && error.status === 400,
  );
  assert.deepEqual(calls, []);
});

test("invitar maps duplicate Auth email errors to a public 409", async () => {
  const { deps } = dependencies({
    admin: {
      auth: {
        admin: {
          async inviteUserByEmail() {
            return { data: { user: null }, error: { code: "email_exists", message: "internal duplicate details" } };
          },
          async deleteUser() {
            return { error: null };
          },
        },
      },
    },
  });
  await assert.rejects(
    createUsuariosService(deps).invitar(inviteInput, adminActor),
    (error: unknown) =>
      error instanceof HttpError &&
      error.code === "DUPLICATE_EMAIL" &&
      error.status === 409 &&
      error.message === "El email ya está registrado.",
  );
});

test("invitar maps thrown duplicate and generic Auth failures without leaking details", async () => {
  const duplicate = dependencies({
    admin: {
      auth: {
        admin: {
          async inviteUserByEmail() {
            throw new Error("email already exists internally");
          },
          async deleteUser() { return { error: null }; },
        },
      },
    },
  });
  await assert.rejects(
    createUsuariosService(duplicate.deps).invitar(inviteInput, adminActor),
    (error: unknown) => error instanceof HttpError && error.code === "DUPLICATE_EMAIL" && error.status === 409,
  );

  const generic = dependencies({
    admin: {
      auth: {
        admin: {
          async inviteUserByEmail() {
            throw new Error("private provider details");
          },
          async deleteUser() { return { error: null }; },
        },
      },
    },
  });
  await assert.rejects(
    createUsuariosService(generic.deps).invitar(inviteInput, adminActor),
    (error: unknown) => error instanceof HttpError && error.code === "INVITATION_ERROR" && !error.message.includes("private"),
  );

  for (const error of [
    { code: "user_already_exists", message: "provider details" },
    { status: 422, message: "user already exists" },
    { status: 422, message: "duplicate" },
  ]) {
    const duplicateResponse = dependencies({
      admin: {
        auth: {
          admin: {
            async inviteUserByEmail() { return { data: { user: null }, error }; },
            async deleteUser() { return { error: null }; },
          },
        },
      },
    });
    await assert.rejects(
      createUsuariosService(duplicateResponse.deps).invitar(inviteInput, adminActor),
      (caught: unknown) => caught instanceof HttpError && caught.code === "DUPLICATE_EMAIL" && caught.status === 409,
    );
  }

  const missingMessage = dependencies({
    admin: {
      auth: {
        admin: {
          async inviteUserByEmail() {
            return { data: { user: null }, error: { status: 500 } };
          },
          async deleteUser() { return { error: null }; },
        },
      },
    },
  });
  await assert.rejects(
    createUsuariosService(missingMessage.deps).invitar(inviteInput, adminActor),
    (error: unknown) => error instanceof HttpError && error.code === "INVITATION_ERROR",
  );
});

test("invitar handles non-duplicate Auth responses and missing identities safely", async () => {
  const nonDuplicate = dependencies({
    admin: {
      auth: {
        admin: {
          async inviteUserByEmail() {
            return { data: { user: null }, error: { status: 500, message: "private provider details" } };
          },
          async deleteUser() { return { error: null }; },
        },
      },
    },
  });
  await assert.rejects(createUsuariosService(nonDuplicate.deps).invitar(inviteInput, adminActor), /No se pudo completar/);

  const missingIdentity = dependencies({
    admin: {
      auth: {
        admin: {
          async inviteUserByEmail() { return { data: null, error: null }; },
          async deleteUser() { return { error: null }; },
        },
      },
    },
  });
  await assert.rejects(createUsuariosService(missingIdentity.deps).invitar(inviteInput, adminActor), /No se pudo completar/);
});

test("invitar compensates an Auth identity when profile creation fails", async () => {
  const { deps, calls } = dependencies({
    prisma: {
      usuario: {
        async create() {
          throw new Error("private database details");
        },
        async findMany() {
          return [];
        },
      },
    },
  });
  await assert.rejects(
    createUsuariosService(deps).invitar(inviteInput, adminActor),
    (error: unknown) =>
      error instanceof HttpError &&
      error.code === "INVITATION_ERROR" &&
      error.status === 500 &&
      error.message === "No se pudo completar la invitación." &&
      !error.message.includes("private"),
  );
  assert.deepEqual(calls, [
    "invite:new@example.com:https://app.example.com/auth/confirm",
    "delete:auth-new",
  ]);
});

test("invitar keeps a safe public error if Auth compensation itself fails", async () => {
  const { deps, calls } = dependencies({
    admin: {
      auth: {
        admin: {
          async inviteUserByEmail() {
            calls.push("invite:new@example.com:https://app.example.com/auth/confirm");
            return { data: { user: { id: "auth-new" } }, error: null };
          },
          async deleteUser() {
            calls.push("delete:auth-new");
            throw new Error("private auth cleanup details");
          },
        },
      },
    },
    prisma: {
      usuario: {
        async create() {
          throw new Error("private database details");
        },
        async findMany() {
          return [];
        },
      },
    },
  });
  await assert.rejects(
    createUsuariosService(deps).invitar(inviteInput, adminActor),
    (error: unknown) => error instanceof HttpError && error.code === "INVITATION_ERROR" && error.status === 500,
  );
  assert.deepEqual(calls, [
    "invite:new@example.com:https://app.example.com/auth/confirm",
    "delete:auth-new",
  ]);
});

test("invitar cleans up its newly created Auth identity for a profile email conflict", async () => {
  const { deps, calls } = dependencies({
    prisma: {
      usuario: {
        async create() {
          throw { code: "P2002", meta: { target: ["email"] } };
        },
        async findMany() {
          return [];
        },
      },
    },
  });
  await assert.rejects(
    createUsuariosService(deps).invitar(inviteInput, adminActor),
    (error: unknown) =>
      error instanceof HttpError &&
      error.code === "DUPLICATE_EMAIL" &&
      error.status === 409 &&
      error.message === "El email ya está registrado.",
  );
  assert.deepEqual(calls, [
    "invite:new@example.com:https://app.example.com/auth/confirm",
    "delete:auth-new",
  ]);
});

test("invitar preserves the Auth identity for an auth_user_id conflict", async () => {
  const { deps, calls } = dependencies({
    prisma: {
      usuario: {
        async create() {
          throw { code: "P2002", meta: { target: ["auth_user_id"] } };
        },
        async findMany() {
          return [];
        },
      },
    },
  });
  await assert.rejects(
    createUsuariosService(deps).invitar(inviteInput, adminActor),
    (error: unknown) =>
      error instanceof HttpError &&
      error.code === "DUPLICATE_EMAIL" &&
      error.status === 409 &&
      error.message === "El email ya está registrado.",
  );
  assert.deepEqual(calls, [
    "invite:new@example.com:https://app.example.com/auth/confirm",
  ]);
});

test("invitar safely compensates an unknown profile conflict and returns a generic error", async () => {
  const { deps, calls } = dependencies({
    prisma: {
      usuario: {
        async create() {
          throw { code: "P2002", meta: { target: ["unrecognized_constraint"] } };
        },
        async findMany() {
          return [];
        },
      },
    },
  });
  await assert.rejects(
    createUsuariosService(deps).invitar(inviteInput, adminActor),
    (error: unknown) =>
      error instanceof HttpError &&
      error.code === "INVITATION_ERROR" &&
      error.status === 500 &&
      error.message === "No se pudo completar la invitación.",
  );
  assert.deepEqual(calls, [
    "invite:new@example.com:https://app.example.com/auth/confirm",
    "delete:auth-new",
  ]);
});

test("invitar maps a profile conflict with a scalar email target to 409", async () => {
  const { deps, calls } = dependencies({
    prisma: {
      usuario: {
        async create() {
          throw { code: "P2002", meta: { target: "email" } };
        },
        async findMany() {
          return [];
        },
      },
    },
  });
  await assert.rejects(
    createUsuariosService(deps).invitar(inviteInput, adminActor),
    (error: unknown) => error instanceof HttpError && error.code === "DUPLICATE_EMAIL" && error.status === 409,
  );
  assert.deepEqual(calls, [
    "invite:new@example.com:https://app.example.com/auth/confirm",
    "delete:auth-new",
  ]);
});

/* Prisma normally serializes target as an array, but keep the conservative
 * fallback covered if a driver returns an unexpected shape. */
test("invitar compensates a P2002 conflict without a target", async () => {
  const { deps, calls } = dependencies({
    prisma: {
      usuario: {
        async create() {
          throw { code: "P2002" };
        },
        async findMany() {
          return [];
        },
      },
    },
  });
  await assert.rejects(createUsuariosService(deps).invitar(inviteInput, adminActor), (error: unknown) =>
    error instanceof HttpError && error.code === "INVITATION_ERROR" && error.status === 500,
  );
  assert.deepEqual(calls, [
    "invite:new@example.com:https://app.example.com/auth/confirm",
    "delete:auth-new",
  ]);
});

/* Keep the conflict branch's non-object guard explicit for malformed drivers. */
test("invitar compensates a malformed profile conflict safely", async () => {
  const { deps, calls } = dependencies({
    prisma: {
      usuario: {
        async create() {
          throw null;
        },
        async findMany() {
          return [];
        },
      },
    },
  });
  await assert.rejects(createUsuariosService(deps).invitar(inviteInput, adminActor), HttpError);
  assert.deepEqual(calls, [
    "invite:new@example.com:https://app.example.com/auth/confirm",
    "delete:auth-new",
  ]);
});

/* The target may contain more than one field; preserve safety if auth_user_id
 * is among them. */
test("invitar preserves identity when a compound conflict includes auth_user_id", async () => {
  const { deps, calls } = dependencies({
    prisma: {
      usuario: {
        async create() {
          throw { code: "P2002", meta: { target: ["email", "auth_user_id"] } };
        },
        async findMany() {
          return [];
        },
      },
    },
  });
  await assert.rejects(createUsuariosService(deps).invitar(inviteInput, adminActor), (error: unknown) =>
    error instanceof HttpError && error.code === "DUPLICATE_EMAIL" && error.status === 409,
  );
  assert.deepEqual(calls, [
    "invite:new@example.com:https://app.example.com/auth/confirm",
  ]);
});

/* Prisma's unique error code is the only recognized conflict marker. */
test("invitar still compensates non-Prisma profile failures", async () => {
  const { deps, calls } = dependencies({
    prisma: {
      usuario: {
        async create() {
          throw { code: "P2025" };
        },
        async findMany() {
          return [];
        },
      },
    },
  });
  await assert.rejects(createUsuariosService(deps).invitar(inviteInput, adminActor), (error: unknown) =>
    error instanceof HttpError && error.code === "INVITATION_ERROR" && error.status === 500,
  );
  assert.deepEqual(calls, [
    "invite:new@example.com:https://app.example.com/auth/confirm",
    "delete:auth-new",
  ]);
});

/* Keep the conflict target handling independent of internal error messages. */
test("invitar does not expose profile conflict metadata", async () => {
  const { deps } = dependencies({
    prisma: {
      usuario: {
        async create() {
          throw { code: "P2002", meta: { target: ["email"] }, message: "secret profile details" };
        },
        async findMany() {
          return [];
        },
      },
    },
  });
  await assert.rejects(createUsuariosService(deps).invitar(inviteInput, adminActor), (error: unknown) =>
    error instanceof HttpError && error.code === "DUPLICATE_EMAIL" && !error.message.includes("secret"),
  );
});

/* Keep this case separate from malformed values to exercise false P2002 guards. */
test("invitar treats non-P2002 object failures as generic errors", async () => {
  const { deps, calls } = dependencies({
    prisma: {
      usuario: {
        async create() {
          throw { code: "UNKNOWN", meta: { target: ["email"] } };
        },
        async findMany() {
          return [];
        },
      },
    },
  });
  await assert.rejects(createUsuariosService(deps).invitar(inviteInput, adminActor), (error: unknown) =>
    error instanceof HttpError && error.code === "INVITATION_ERROR" && error.status === 500,
  );
  assert.deepEqual(calls, [
    "invite:new@example.com:https://app.example.com/auth/confirm",
    "delete:auth-new",
  ]);
});

test("listar masks private email fields for AUDITOR and keeps the public shape", async () => {
  const { deps } = dependencies();
  const users = await createUsuariosService(deps).listar({ ...adminActor, rol: "AUDITOR" });
  assert.deepEqual(users, [
    { id: 7, email: "au****@example.com", rol: "AUDITOR", puede_aprobar_liquidaciones: false },
  ]);
});

test("listar leaves the public email unchanged for non-auditors", async () => {
  const { deps } = dependencies();
  const users = await createUsuariosService(deps).listar(adminActor);
  assert.equal(users[0]?.email, "auditor@example.com");
});

test("the default service composes the server-only Admin and Prisma dependencies", async () => {
  const previous = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    secret: process.env.SUPABASE_SECRET_KEY,
    appUrl: process.env.APP_URL,
    database: process.env.DATABASE_URL,
  };
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-publishable-key",
    SUPABASE_SECRET_KEY: "local-secret-key",
    APP_URL: "http://127.0.0.1:3000",
    DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  });
  try {
    await assert.rejects(UsuariosService.invitar(inviteInput, adminActor), HttpError);
  } finally {
    for (const [name, value] of Object.entries({
      NEXT_PUBLIC_SUPABASE_URL: previous.url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: previous.key,
      SUPABASE_SECRET_KEY: previous.secret,
      APP_URL: previous.appUrl,
      DATABASE_URL: previous.database,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
