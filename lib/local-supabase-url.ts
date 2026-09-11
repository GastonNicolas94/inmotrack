const LOCAL_SUPABASE_HOSTS = new Set(["127.0.0.1", "localhost"]);

export function normalizeSupabaseUrl(raw: string) {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error("La URL Supabase no es válida.");
  }

  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    !parsed.hostname
  ) {
    throw new Error("La URL Supabase debe ser un origen sin credenciales, path, query ni hash.");
  }

  const port = parsed.port || (parsed.protocol === "http:" ? "80" : "443");
  return `${parsed.protocol}//${parsed.hostname.toLowerCase()}:${port}`;
}

export function assertLocalSupabaseUrl(raw: string) {
  const normalized = normalizeSupabaseUrl(raw);
  const parsed = new URL(normalized);
  if (
    parsed.protocol !== "http:" ||
    !LOCAL_SUPABASE_HOSTS.has(parsed.hostname) ||
    parsed.port !== "54321"
  ) {
    throw new Error(
      "Las operaciones Auth destructivas solo pueden usar Supabase local en http://127.0.0.1:54321 o http://localhost:54321."
    );
  }
  return normalized;
}
