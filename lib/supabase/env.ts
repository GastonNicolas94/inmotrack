type Environment = Record<string, string | undefined>;

export function readSupabasePublicEnv(env: Environment = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL es obligatoria.");
  if (!publishableKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY es obligatoria.");
  }
  return { url, publishableKey };
}

export function readSupabaseSecret(env: Environment = process.env) {
  const value = env.SUPABASE_SECRET_KEY?.trim();
  if (!value) throw new Error("SUPABASE_SECRET_KEY es obligatoria.");
  return value;
}

export function readAppUrl(env: Environment = process.env): string {
  const value = env.APP_URL?.trim();
  if (!value) throw new Error("APP_URL es obligatoria.");

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("APP_URL debe ser un origen HTTP o HTTPS.");
  }

  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    (parsed.pathname !== "" && parsed.pathname !== "/") ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("APP_URL debe ser un origen HTTP o HTTPS sin credenciales ni ruta.");
  }

  return parsed.origin;
}
