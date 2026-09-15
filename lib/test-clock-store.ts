import type { TestClockStore } from "@/lib/clock";

const CLOCK_KEY = "inmotrack_test_date";

type EnvLike = Record<string, string | undefined>;
type FetchLike = typeof fetch;

const globalClock = globalThis as typeof globalThis & { __inmotrackTestDate?: string | null };

function localStore(): TestClockStore {
  return {
    async get() {
      return globalClock.__inmotrackTestDate ?? process.env.FECHA_SIMULADA ?? null;
    },
    async set(fecha) {
      globalClock.__inmotrackTestDate = fecha;
    },
    async clear() {
      globalClock.__inmotrackTestDate = null;
    },
  };
}

function globalConfigStore(env: EnvLike, fetchImpl: FetchLike): TestClockStore {
  function config() {
    const configId = env.INMOTRACK_TEST_CLOCK_CONFIG_ID;
    const readToken = env.INMOTRACK_TEST_CLOCK_READ_TOKEN;
    const writeToken = env.INMOTRACK_TEST_CLOCK_VERCEL_TOKEN;
    const teamId = env.INMOTRACK_TEST_CLOCK_TEAM_ID;

    if (!configId || !readToken || !writeToken || !teamId) {
      throw new Error(
        "Reloj de pruebas sin configurar: faltan variables de Global Config de Vercel.",
      );
    }

    return {
      readUrl: `https://global-config.vercel.com/${configId}/item/${CLOCK_KEY}?token=${encodeURIComponent(readToken)}`,
      writeUrl: `https://api.vercel.com/v1/global-config/${configId}/items?teamId=${encodeURIComponent(teamId)}`,
      writeToken,
    };
  }

  return {
    async get() {
      const { readUrl } = config();
      const response = await fetchImpl(readUrl, { cache: "no-store" });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`No se pudo leer el reloj global (${response.status}).`);
      const value = await response.json();
      return typeof value === "string" ? value : null;
    },
    async set(fecha) {
      const { writeUrl, writeToken } = config();
      const response = await fetchImpl(writeUrl, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${writeToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ items: [{ operation: "upsert", key: CLOCK_KEY, value: fecha }] }),
      });
      if (!response.ok) throw new Error(`No se pudo actualizar el reloj global (${response.status}).`);
    },
    async clear() {
      const { writeUrl, writeToken } = config();
      const response = await fetchImpl(writeUrl, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${writeToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ items: [{ operation: "delete", key: CLOCK_KEY }] }),
      });
      if (!response.ok) throw new Error(`No se pudo limpiar el reloj global (${response.status}).`);
    },
  };
}

export function createTestClockStore(
  env: EnvLike = process.env,
  fetchImpl: FetchLike = fetch,
): TestClockStore {
  return env.VERCEL_ENV === "preview" ? globalConfigStore(env, fetchImpl) : localStore();
}
