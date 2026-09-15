export const TEST_CLOCK_COOKIE = "inmotrack_test_date";
export const TEST_CLOCK_HEADER = "x-inmotrack-test-date";
export const TEST_CLOCK_CONTRACT_COOKIE = "inmotrack_test_contract_id";
export const TEST_CLOCK_CONTRACT_HEADER = "x-inmotrack-test-contract-id";

type EnvLike = Record<string, string | undefined>;

export function relojPruebasHabilitado(env: EnvLike = process.env): boolean {
  if (env.VERCEL_ENV === "production") return false;
  if (env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "development") return true;
  return env.NODE_ENV !== "production";
}

export function parseTestContractId(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
