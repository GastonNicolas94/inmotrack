/* c8 ignore next -- c8 reports synthetic TypeScript module-helper branches here. */
type SeedPasswordEnv = Record<string, string | undefined>;

/* c8 ignore next -- c8 reports synthetic TypeScript module-helper branches here. */
export function requireSeedPassword(env: SeedPasswordEnv = process.env) {
  const value = env.INMOTRACK_SEED_PASSWORD?.trim();
  if (!value) throw new Error("INMOTRACK_SEED_PASSWORD es obligatoria para ejecutar el seed.");
  return value;
}
