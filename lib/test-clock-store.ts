import { get as getGlobalConfigItem } from "@vercel/global-config";
import type { TestClockStore } from "@/lib/clock";

const CLOCK_KEY = "inmotrack_test_date";
const INMOTRACK_TEST_CLOCK_GLOBAL_CONFIG_ID = "ecfg_dgdcbruhamcqzsjkbtpelw41vkvg";
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

function globalConfigStore(
  env: EnvLike,
  fetchImpl: FetchLike,
  getItem: GlobalConfigGet,
): TestClockStore {
  function writeConfig() {
    if (!env.GLOBAL_CONFIG) {
      throw new Error("Reloj de pruebas sin configurar: GLOBAL_CONFIG no está conectada al Preview.");
    }

    const writeToken = env.VERCEL_TOKEN;
    if (!writeToken) {
      throw new Error("Reloj de pruebas sin token de escritura: falta VERCEL_TOKEN en Preview.");
    }

    const teamId = env.VERCEL_TEAM_ID ?? env.VERCEL_ORG_ID ?? INMOTRACK_VERCEL_TEAM_ID;
    const itemUrl = new URL(
      `https://api.vercel.com/v1/global-config/${INMOTRACK_TEST_CLOCK_GLOBAL_CONFIG_ID}/item/${CLOCK_KEY}`,
    );
    const writeUrl = new URL(
      `https://api.vercel.com/v1/global-config/${INMOTRACK_TEST_CLOCK_GLOBAL_CONFIG_ID}/items`,
    );
    itemUrl.searchParams.set("teamId", teamId);
    writeUrl.searchParams.set("teamId", teamId);

    return {
      itemUrl: itemUrl.toString(),
      writeUrl: writeUrl.toString(),
      writeToken,
    };
  }

  async function readStoredDate() {
    const stored = await getItem(CLOCK_KEY);
    return typeof stored === "string" ? stored : null;
  }

  async function mutate(items: Array<Record<string, unknown>>) {
    const { itemUrl, writeUrl, writeToken } = writeConfig();
    const headers = {
      Authorization: `Bearer ${writeToken}`,
      "Content-Type": "application/json",
    };

    const verification = await fetchImpl(itemUrl, {
      method: "GET",
      headers,
    });

    if (!verification.ok) {
      const body = await verification.text().catch(() => "");
      const suffix = body ? `: ${body}` : "";
      throw new Error(
        `Fallo en verificacion de item Global Config (${verification.status})${suffix}`,
      );
    }

    const response = await fetchImpl(writeUrl, {
      method: "PATCH",
      headers,
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
