import { parseFechaCalendario } from "@/lib/fecha";
import { relojPruebasHabilitado } from "@/lib/reloj-pruebas";

export type ClockDate = { anio: number; mes: number; dia: number };

export interface Clock {
  now(): Promise<Date>;
  today(): Promise<ClockDate>;
}

export interface MutableClock extends Clock {
  setDate(fecha: string): Promise<void>;
  clear(): Promise<void>;
  getDate(): Promise<string | null>;
}

export interface TestClockStore {
  get(): Promise<string | null>;
  set(fecha: string): Promise<void>;
  clear(): Promise<void>;
}

type EnvLike = Record<string, string | undefined>;

function argentinaParts(value: Date): ClockDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { anio: get("year"), mes: get("month"), dia: get("day") };
}

function simulatedNow(fecha: string): Date {
  const { anio, mes, dia } = parseFechaCalendario(fecha);
  return new Date(Date.UTC(anio, mes - 1, dia, 15, 0, 0, 0));
}

export function createSystemClock(source: () => Date = () => new Date()): Clock {
  return {
    async now() {
      return new Date(source().getTime());
    },
    async today() {
      return argentinaParts(source());
    },
  };
}

export function createTestClock(
  store: TestClockStore,
  source: () => Date = () => new Date(),
): MutableClock {
  return {
    async getDate() {
      return store.get();
    },
    async setDate(fecha: string) {
      parseFechaCalendario(fecha);
      await store.set(fecha);
    },
    async clear() {
      await store.clear();
    },
    async now() {
      const fecha = await store.get();
      return fecha ? simulatedNow(fecha) : new Date(source().getTime());
    },
    async today() {
      const fecha = await store.get();
      return fecha ? parseFechaCalendario(fecha) : argentinaParts(source());
    },
  };
}

export function createClock(
  env: EnvLike,
  store: TestClockStore,
  source: () => Date = () => new Date(),
): Clock {
  return relojPruebasHabilitado(env)
    ? createTestClock(store, source)
    : createSystemClock(source);
}
