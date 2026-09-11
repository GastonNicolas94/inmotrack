import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeSupabaseUrl } from "../lib/local-supabase-url.ts";
import { readAppUrl } from "../lib/supabase/env.ts";

type Environment = Record<string, string | undefined>;

type AdminClient = {
  auth: {
    admin: {
      inviteUserByEmail(email: string, options: { redirectTo: string }): Promise<{
        data: { user: { id: string } | null };
        error: unknown | null;
      }>;
      deleteUser(id: string): Promise<{ error: unknown | null }>;
    };
  };
};

type ProfileStore = {
  usuario: {
    create(args: { data: { email: string; auth_user_id: string; rol: "ADMIN" } }): Promise<unknown>;
  };
};

export type BootstrapDependencies = {
  createAdmin: () => AdminClient | Promise<AdminClient>;
  getPrisma: () => ProfileStore | Promise<ProfileStore>;
};

/**
 * Bootstrap is an invitation-only operation. The operator must explicitly
 * confirm the environment with BOOTSTRAP_ADMIN_CONFIRM_ENV and the exact
 * normalized destination with BOOTSTRAP_ADMIN_CONFIRM_SUPABASE_URL; absent or
 * mismatched confirmations abort before clients are created. In production,
 * local/demo password variables are forbidden.
 */
export function readBootstrapConfig(env: Environment = process.env) {
  const email = env.BOOTSTRAP_ADMIN_EMAIL?.trim();
  if (!email) throw new Error("BOOTSTRAP_ADMIN_EMAIL es obligatoria.");

  const environment = env.NODE_ENV?.trim();
  if (environment !== "production" && environment !== "development" && environment !== "test") {
    throw new Error("NODE_ENV debe ser exactamente production, development o test.");
  }
  const confirmation = env.BOOTSTRAP_ADMIN_CONFIRM_ENV?.trim();
  if (!confirmation) {
    throw new Error(
      `Confirmá explícitamente el entorno con BOOTSTRAP_ADMIN_CONFIRM_ENV=${environment}.`
    );
  }
  if (confirmation !== environment) {
    throw new Error(
      `BOOTSTRAP_ADMIN_CONFIRM_ENV (${confirmation}) no coincide con el entorno ${environment}.`
    );
  }

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL es obligatoria.");
  const appUrl = readAppUrl(env);
  const destinationConfirmation = env.BOOTSTRAP_ADMIN_CONFIRM_SUPABASE_URL?.trim();
  if (!destinationConfirmation) {
    throw new Error(
      "Confirmá explícitamente el destino con BOOTSTRAP_ADMIN_CONFIRM_SUPABASE_URL."
    );
  }
  if (normalizeSupabaseUrl(supabaseUrl) !== normalizeSupabaseUrl(destinationConfirmation)) {
    throw new Error("La URL Supabase de destino confirmada no coincide con la configuración activa.");
  }

  if (
    environment === "production" &&
    (env.INMOTRACK_SEED_PASSWORD?.trim() || env.BOOTSTRAP_ADMIN_PASSWORD?.trim())
  ) {
    throw new Error(
      "No se permite configuración de password demo/local en producción (INMOTRACK_SEED_PASSWORD o BOOTSTRAP_ADMIN_PASSWORD)."
    );
  }

  return { email, environment, supabaseUrl: normalizeSupabaseUrl(supabaseUrl), appUrl } as const;
}

export async function bootstrapAdmin(
  email: string,
  admin: AdminClient,
  prisma: ProfileStore,
  appUrl: string,
) {
  const redirectTo = `${readAppUrl({ APP_URL: appUrl })}/auth/confirm`;
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (error) throw error;

  const authUserId = data.user?.id;
  if (!authUserId) throw new Error("Supabase no devolvió el usuario invitado.");

  try {
    await prisma.usuario.create({
      data: { email, auth_user_id: authUserId, rol: "ADMIN" },
    });
  } catch (profileError) {
    const { error: cleanupError } = await admin.auth.admin.deleteUser(authUserId);
    if (cleanupError) {
      throw new AggregateError(
        [profileError, cleanupError],
        "No se pudo crear el perfil ADMIN y también falló la compensación de Auth."
      );
    }
    throw profileError;
  }
}

export async function main(
  env: Environment = process.env,
  dependencies?: BootstrapDependencies
) {
  const { email, appUrl } = readBootstrapConfig(env);
  /* c8 ignore start -- runtime-only imports are exercised by the CLI, not unit tests. */
  const runtimeDependencies = dependencies ?? {
    createAdmin: async () => (await import("../lib/supabase/admin.ts")).createAdminSupabaseClient(),
    getPrisma: async () => (await import("../lib/db.ts")).prisma,
  };
  /* c8 ignore stop */
  const [admin, prisma] = await Promise.all([
    runtimeDependencies.createAdmin(),
    runtimeDependencies.getPrisma(),
  ]);
  await bootstrapAdmin(email, admin, prisma, appUrl);
  console.log(`✅ Invitación enviada y perfil ADMIN creado para ${email}.`);
}

/* c8 ignore start -- CLI entrypoint is not imported by unit tests. */
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
/* c8 ignore stop */
