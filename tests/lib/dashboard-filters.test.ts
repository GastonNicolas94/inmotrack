import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  getArgentinaMonthRange,
  parseDashboardFilters,
  serializeDashboardFilters,
} from "@/lib/dashboard/filters";

describe("dashboard filters", () => {
  test("uses safe defaults for an empty query", () => {
    const filters = parseDashboardFilters({}, new Date("2026-09-12T15:00:00Z"));

    assert.deepEqual(filters, {
      tab: "operativo",
      periodo: "2026-09",
      propiedadId: null,
      cartera: "todas",
      periodoInicio: new Date("2026-09-01T03:00:00.000Z"),
      periodoFinExclusivo: new Date("2026-10-01T03:00:00.000Z"),
    });
  });

  test("rejects invalid tab, month, property and portfolio values", () => {
    const filters = parseDashboardFilters({
      tab: "otro",
      periodo: "2026-99",
      propiedad: "-4",
      cartera: "desconocida",
    }, new Date("2026-09-12T15:00:00Z"));

    assert.equal(filters.tab, "operativo");
    assert.equal(filters.periodo, "2026-09");
    assert.equal(filters.propiedadId, null);
    assert.equal(filters.cartera, "todas");
  });

  test("serializes tab changes without dropping shared filters", () => {
    const query = serializeDashboardFilters({
      tab: "operativo",
      periodo: "2026-09",
      propiedadId: 7,
      cartera: "terceros",
      periodoInicio: new Date("2026-09-01T03:00:00.000Z"),
      periodoFinExclusivo: new Date("2026-10-01T03:00:00.000Z"),
    }, { tab: "financiero" });

    assert.equal(query, "tab=financiero&periodo=2026-09&propiedad=7&cartera=terceros");
  });

  test("uses only the first repeated query value", () => {
    const filters = parseDashboardFilters(new URLSearchParams([
      ["tab", "financiero"],
      ["tab", "operativo"],
      ["periodo", "2026-02"],
      ["periodo", "2026-01"],
      ["propiedad", "todos"],
      ["cartera", "propias"],
    ]), new Date("2026-09-12T15:00:00Z"));

    assert.equal(filters.tab, "financiero");
    assert.equal(filters.periodo, "2026-02");
    assert.equal(filters.propiedadId, null);
    assert.equal(filters.cartera, "propias");
  });

  test("accepts todos and positive integer property IDs", () => {
    assert.equal(parseDashboardFilters({ propiedad: "todos" }).propiedadId, null);
    assert.equal(parseDashboardFilters({ propiedad: "12" }).propiedadId, 12);
    assert.equal(parseDashboardFilters({ propiedad: "1.5" }).propiedadId, null);
    assert.equal(parseDashboardFilters({ propiedad: "0" }).propiedadId, null);
    assert.equal(parseDashboardFilters({ propiedad: "12abc" }).propiedadId, null);
  });

  test("falls back for impossible calendar months and dates", () => {
    const now = new Date("2026-01-08T15:00:00Z");
    assert.equal(parseDashboardFilters({ periodo: "2026-02-30" }, now).periodo, "2026-01");
    assert.equal(parseDashboardFilters({ periodo: "2026-00" }, now).periodo, "2026-01");
    assert.equal(parseDashboardFilters({ periodo: "2026-13" }, now).periodo, "2026-01");
    assert.equal(parseDashboardFilters({ periodo: "26-01" }, now).periodo, "2026-01");
  });

  test("uses Argentina calendar boundaries independent of process timezone", () => {
    const range = getArgentinaMonthRange("2026-03");
    assert.equal(range.inicio.toISOString(), "2026-03-01T03:00:00.000Z");
    assert.equal(range.finExclusivo.toISOString(), "2026-04-01T03:00:00.000Z");

    const atMonthEndUtc = parseDashboardFilters({}, new Date("2026-10-01T02:59:59Z"));
    assert.equal(atMonthEndUtc.periodo, "2026-09");
    const atNextMonthUtc = parseDashboardFilters({}, new Date("2026-10-01T03:00:00Z"));
    assert.equal(atNextMonthUtc.periodo, "2026-10");
  });

  test("serializes todos without an arbitrary property", () => {
    const query = serializeDashboardFilters({
      tab: "operativo",
      periodo: "2026-09",
      propiedadId: null,
      cartera: "todas",
      periodoInicio: new Date("2026-09-01T03:00:00.000Z"),
      periodoFinExclusivo: new Date("2026-10-01T03:00:00.000Z"),
    });
    assert.equal(query, "tab=operativo&periodo=2026-09&propiedad=todos&cartera=todas");
  });

  test("clears an existing property when explicitly overridden with null", () => {
    const query = serializeDashboardFilters({
      tab: "operativo",
      periodo: "2026-09",
      propiedadId: 7,
      cartera: "todas",
      periodoInicio: new Date("2026-09-01T03:00:00.000Z"),
      periodoFinExclusivo: new Date("2026-10-01T03:00:00.000Z"),
    }, { propiedadId: null });

    assert.equal(query, "tab=operativo&periodo=2026-09&propiedad=todos&cartera=todas");
  });

  test("retains an existing property when an optional override is undefined", () => {
    const query = serializeDashboardFilters({
      tab: "operativo",
      periodo: "2026-09",
      propiedadId: 7,
      cartera: "todas",
      periodoInicio: new Date("2026-09-01T03:00:00.000Z"),
      periodoFinExclusivo: new Date("2026-10-01T03:00:00.000Z"),
    }, { propiedadId: undefined });

    assert.equal(query, "tab=operativo&periodo=2026-09&propiedad=7&cartera=todas");
  });

  test("rejects a directly invalid month range", () => {
    assert.throws(() => getArgentinaMonthRange("2026-02-30"), RangeError);
  });

  test("preserves years below 100 and rolls December into the next year", () => {
    const january = getArgentinaMonthRange("0001-01");
    assert.equal(january.inicio.toISOString(), "0001-01-01T03:00:00.000Z");
    assert.equal(january.finExclusivo.toISOString(), "0001-02-01T03:00:00.000Z");

    const december = getArgentinaMonthRange("0099-12");
    assert.equal(december.inicio.toISOString(), "0099-12-01T03:00:00.000Z");
    assert.equal(december.finExclusivo.toISOString(), "0100-01-01T03:00:00.000Z");
  });

  test("falls back to Argentina today when now is invalid", () => {
    const filters = parseDashboardFilters({}, new Date("not-a-date"));
    const expected = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
    }).format(new Date());
    assert.equal(filters.periodo, expected);
  });

  test("handles missing URLSearchParams values with defaults", () => {
    const filters = parseDashboardFilters(new URLSearchParams(), new Date("2026-09-12T15:00:00Z"));
    assert.equal(filters.tab, "operativo");
    assert.equal(filters.periodo, "2026-09");
    assert.equal(filters.propiedadId, null);
    assert.equal(filters.cartera, "todas");
  });

  test("takes the first value from a record array", () => {
    const filters = parseDashboardFilters({
      tab: ["financiero", "operativo"],
      periodo: ["2026-11", "2026-10"],
      propiedad: ["4", "5"],
      cartera: ["terceros", "propias"],
    }, new Date("2026-09-12T15:00:00Z"));
    assert.equal(filters.tab, "financiero");
    assert.equal(filters.periodo, "2026-11");
    assert.equal(filters.propiedadId, 4);
    assert.equal(filters.cartera, "terceros");
  });
});
