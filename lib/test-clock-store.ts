import { get as getGlobalConfigItem } from "@vercel/global-config";
import type { TestClockStore } from "@/lib/clock";

const CLOCK_KEY = "inmotrack_test_date";
const INMOTRACK_VERCEL_TEAM_ID = "team_pSHI2gL7fkccZnt2ayzYTco7";

type EnvLike = Record<string, string | undefined>;
type FetchLike = typeof fetch;
type GlobalConfigGet = (key: string) => Promise<unknown>;

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

function parseGlobalConfigId(raw: string | undefined) {
  if (!raw) return null;

  const url = new URL(raw);
  const configId = url.pathname.split("/").filter(Boolean)[0];
  return configId || null;
}

function globalConfigStore(
  env: EnvLike,
  fetchImpl: FetchLike,
  getItem: GlobalConfigGet,
): TestClockStore {
  function writeConfig() {
    const configId = parseGlobalConfigId(env.GLOBAL_CONFIG);
    if (!configId) {
      throw new Error("Reloj de pruebas sin configurar: GLOBAL_CONFIG no está conectada al Preview.");
    }

    const writeToken = env.VERCEL_TOKEN;
    if (!writeToken) {
      throw new Error("Reloj de pruebas sin token de escritura: falta VERCEL_TOKEN en Preview.");
    }

    const teamId = env.VERCEL_TEAM_ID ?? env.VERCEL_ORG_ID ?? INMOTRACK_VERCEL_TEAM_ID;
    const writeUrl = new URL(`https://api.vercel.com/v1/global-config/${configId}/items`);
    writeUrl.searchParams.set("teamId", teamId);

    return { writeUrl: writeUrl.toString(), writeToken };
  }

  async function readStoredDate() {
    const stored = await getItem(CLOCK_KEY);
    return typeof stored === "string" ? stored : null;
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

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const suffix = body ? `: ${body}` : "";
      throw new Error(`No se pudo actualizar el reloj global (${response.status})${suffix}`);
    }
  }

  return {
    async get() {
      return readStoredDate();
    },
    async set(fecha) {
      await mutate([
        {
          operation: "upsert",
          key: CLOCK_KEY,
          value: fecha,
        },
      ]);
    },
    async clear() {
      if ((await readStoredDate()) === null) return;
      await mutate([{ operation: "delete", key: CLOCK_KEY }]);
    },
  };
}

export function createTestClockStore(
  env: EnvLike = process.env,
  fetchImpl: FetchLike = fetch,
  getItem: GlobalConfigGet = getGlobalConfigItem,
): TestClockStore {
  return env.VERCEL_ENV === "preview" ? globalConfigStore(env, fetchImpl, getItem) : localStore();
}
