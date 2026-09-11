/* c8 ignore next -- c8 reports synthetic TypeScript module-helper branches here. */
type DatabaseEnv = Record<string, string | undefined>;

function requireValue(name: "DATABASE_URL" | "DIRECT_URL", env: DatabaseEnv) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} es obligatoria.`);
  return value;
}

export function requireDatabaseUrl(env: DatabaseEnv = process.env) {
  return requireValue("DATABASE_URL", env);
}

export function requireDirectUrl(env: DatabaseEnv = process.env) {
  return requireValue("DIRECT_URL", env);
}

/* c8 ignore next -- c8 reports a synthetic branch on this function declaration. */
export function assertLocalTestDatabase(url: string, env: DatabaseEnv = process.env) {
  if (env.INMOTRACK_ALLOW_DESTRUCTIVE_TESTS !== "1") {
    throw new Error("INMOTRACK_ALLOW_DESTRUCTIVE_TESTS=1 es obligatoria para tests destructivos.");
  }

  const parsed = new URL(url);
  const localHost = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  if (!localHost || parsed.port !== "54322" || parsed.pathname !== "/postgres" || parsed.search) {
    throw new Error("Los tests destructivos solo pueden usar Supabase local en 127.0.0.1:54322/postgres.");
  }
}
