type EnvLike = Record<string, string | undefined>;

export function relojPruebasHabilitado(env: EnvLike = process.env): boolean {
  if (env.VERCEL_ENV === "production") return false;
  if (env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "development") return true;
  return env.NODE_ENV !== "production";
}
