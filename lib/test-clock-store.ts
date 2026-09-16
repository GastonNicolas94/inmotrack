import { del as deleteBlob, get as getBlob, put as putBlob } from "@vercel/blob";
import type { TestClockStore } from "@/lib/clock";

const CLOCK_PATH = "inmotrack/test-clock.json";

type EnvLike = Record<string, string | undefined>;

type BlobGetOptions = {
  access: "private";
  useCache: false;
};

type BlobPutOptions = {
  access: "private";
  allowOverwrite: true;
  contentType: "application/json";
};

type BlobGetResult = {
  statusCode: number;
  stream: ReadableStream<Uint8Array>;
};

type BlobClient = {
  get(pathname: string, options: BlobGetOptions): Promise<BlobGetResult | null>;
  put(pathname: string, body: string, options: BlobPutOptions): Promise<unknown>;
  del(pathname: string): Promise<void>;
};

const defaultBlobClient: BlobClient = {
  async get(pathname, options) {
    return (await getBlob(pathname, options)) as BlobGetResult | null;
  },
  async put(pathname, body, options) {
    return putBlob(pathname, body, options);
  },
  async del(pathname) {
    await deleteBlob(pathname);
  },
};

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

function blobStore(blob: BlobClient): TestClockStore {
  return {
    async get() {
      const result = await blob.get(CLOCK_PATH, {
        access: "private",
        useCache: false,
      });

      if (!result || result.statusCode === 404) return null;
      if (result.statusCode !== 200) {
        throw new Error(`No se pudo leer el reloj global desde Blob (${result.statusCode}).`);
      }

      const payload = (await new Response(result.stream).json()) as { fecha?: unknown };
      return typeof payload.fecha === "string" ? payload.fecha : null;
    },
    async set(fecha) {
      await blob.put(CLOCK_PATH, JSON.stringify({ fecha }), {
        access: "private",
        allowOverwrite: true,
        contentType: "application/json",
      });
    },
    async clear() {
      await blob.del(CLOCK_PATH);
    },
  };
}

export function createTestClockStore(
  env: EnvLike = process.env,
  blob: BlobClient = defaultBlobClient,
): TestClockStore {
  return env.VERCEL_ENV === "preview" ? blobStore(blob) : localStore();
}
