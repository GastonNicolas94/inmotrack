import { assertLocalTestDatabase } from "@/lib/database-url";
import { requireSeedPassword } from "@/lib/seed-password";
import { assertLocalSupabaseUrl } from "@/lib/local-supabase-url";

type Environment = Record<string, string | undefined>;

export type SeedAuthAdmin = {
  listUsers(options: { page: number; perPage: number }): Promise<{
    data: { users: Array<{ id: string }> };
    error: unknown | null;
  }>;
  deleteUser(id: string): Promise<{ error: unknown | null }>;
  createUser(options: {
    email: string;
    password: string;
    email_confirm: boolean;
  }): Promise<{ data: { user: { id: string } | null }; error: unknown | null }>;
};

export type SeedProfileStore = {
  usuario: {
    upsert(args: {
      where: { email: string };
      update: {
        auth_user_id: string;
        rol: "ADMIN" | "EMPLEADO" | "AUDITOR";
        puede_aprobar_liquidaciones?: boolean;
      };
      create: {
        email: string;
        auth_user_id: string;
        rol: "ADMIN" | "EMPLEADO" | "AUDITOR";
        puede_aprobar_liquidaciones?: boolean;
      };
    }): Promise<{ id: number }>;
  };
};

type SeedProfile = {
  email: string;
  auth_user_id: string;
  rol: "ADMIN" | "EMPLEADO" | "AUDITOR";
  puede_aprobar_liquidaciones?: boolean;
};

const DEMO_USERS: Array<Omit<SeedProfile, "auth_user_id">> = [
  { email: "admin@inmotrack.com", rol: "ADMIN" },
  {
    email: "empleado1@inmotrack.com",
    rol: "EMPLEADO",
    puede_aprobar_liquidaciones: true,
  },
  { email: "empleado2@inmotrack.com", rol: "EMPLEADO" },
  { email: "auditor@inmotrack.com", rol: "AUDITOR" },
];

type SeedOptions = {
  databaseUrl: string;
  supabaseUrl: string;
  env?: Environment;
  seedPassword?: string;
};

export async function seedDemoUsers(
  admin: SeedAuthAdmin,
  prisma: SeedProfileStore,
  options: SeedOptions
) {
  const password = options.seedPassword ?? requireSeedPassword(options.env);
  assertLocalTestDatabase(options.databaseUrl, options.env);
  assertLocalSupabaseUrl(options.supabaseUrl);
  await clearLocalAuthUsersIfSafe(admin, options.databaseUrl, options.supabaseUrl, options.env);

  const profiles: Record<string, { id: number }> = {};
  for (const demoUser of DEMO_USERS) {
    const identity = await createSeedAuthUser(admin, demoUser.email, password);
    const profile = await upsertSeedProfile(admin, prisma, {
      ...demoUser,
      auth_user_id: identity.id,
    });
    profiles[demoUser.email] = profile;
  }
  return profiles;
}

/** Delete Auth identities only after the destructive local database guard passes. */
export async function clearLocalAuthUsersIfSafe(
  admin: Pick<SeedAuthAdmin, "listUsers" | "deleteUser">,
  databaseUrl: string,
  supabaseUrl: string,
  env: Environment = process.env
) {
  try {
    assertLocalTestDatabase(databaseUrl, env);
  } catch {
    return false;
  }
  assertLocalSupabaseUrl(supabaseUrl);

  const users: Array<{ id: string }> = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }

  for (const user of users) {
    const { error } = await admin.deleteUser(user.id);
    if (error) throw error;
  }
  return true;
}

export async function createSeedAuthUser(
  admin: Pick<SeedAuthAdmin, "createUser">,
  email: string,
  password: string
) {
  const { data, error } = await admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  if (!data.user) throw new Error("Supabase no devolvió la identidad de seed.");
  return data.user;
}

export async function upsertSeedProfile(
  admin: Pick<SeedAuthAdmin, "deleteUser">,
  prisma: SeedProfileStore,
  profile: SeedProfile
) {
  try {
    return await prisma.usuario.upsert({
      where: { email: profile.email },
      update: {
        auth_user_id: profile.auth_user_id,
        rol: profile.rol,
        ...(profile.puede_aprobar_liquidaciones === undefined
          ? { puede_aprobar_liquidaciones: false }
          : { puede_aprobar_liquidaciones: profile.puede_aprobar_liquidaciones }),
      },
      create: profile,
    });
  } catch (profileError) {
    const { error: cleanupError } = await admin.deleteUser(profile.auth_user_id);
    if (cleanupError) {
      throw new AggregateError(
        [profileError, cleanupError],
        "No se pudo crear el perfil de seed y también falló la compensación de Auth."
      );
    }
    throw profileError;
  }
}
