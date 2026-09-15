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

function parseGlobalConfigConnection(raw: string | undefined) {
  if (!raw) return null;

  const url = new URL(raw);
  const configId = url.pathname.split("/").filter(Boolean)[0];
  if (!configId) return null;

  return { url, configId };
}

function globalConfigStore(env: EnvLike, fetchImpl: FetchLike): TestClockStore {
  function connection() {
    return parseGlobalConfigConnection(env.GLOBAL_CONFIG);
  }

  function readUrl() {
    const value = connection();
    if (!value) return null;

    const url = new URL(value.url.toString());
    url.pathname = `/${value.configId}/item/${CLOCK_KEY}`;
    return url.toString();
  }

  function writeConfig() {
    const value = connection();
    if (!value) {
      throw new Error("Reloj de pruebas sin configurar: GLOBAL_CONFIG no está conectada al Preview.");
    }

    const writeToken = env.VERCEL_TOKEN;
    if (!writeToken) {
      throw new Error("Reloj de pruebas sin token de escritura: falta VERCEL_TOKEN en Preview.");
    }

    const writeUrl = new URL(`https://api.vercel.com/v1/global-config/${value.configId}/items`);
    if (env.VERCEL_TEAM_ID) writeUrl.searchParams.set("teamId", env.VERCEL_TEAM_ID);

    return { writeUrl: writeUrl.toString(), writeToken };
  }

  async function mutate(items: Array<Record<string, unknown>>) {
    const { writeUrl, writeToken } = writeConfig();
    const response = await fetchImpl(writeUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${writeToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ items }),
    });

    if (!response.ok) throw new Error(`No se pudo actualizar el reloj global (${response.status}).`);
  }

  return {
    async get() {
      const url = readUrl();
      if (!url) return null;

      const response = await fetchImpl(url, { cache: "no-store" });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`No se pudo leer el reloj global (${response.status}).`);

      const stored = await response.json();
      return typeof stored === "string" ? stored : null;
    },
    async set(fecha) {
      await mutate([{ operation: "upsert", key: CLOCK_KEY, value: fecha }]);
    },
    async clear() {
      await mutate([{ operation: "delete", key: CLOCK_KEY }]);
    },
  };
}

export function createTestClockStore(
  env: EnvLike = process.env,
  fetchImpl: FetchLike = fetch,
): TestClockStore {
  return env.VERCEL_ENV === "preview" ? globalConfigStore(env, fetchImpl) : localStore();
}
