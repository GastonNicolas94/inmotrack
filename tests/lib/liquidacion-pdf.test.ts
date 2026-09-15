import test from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "@prisma/client/runtime/client";
import type { LiquidacionDetalle } from "../../services/liquidaciones.service.ts";

test("genera un PDF A4 descargable con el detalle de la liquidación", async () => {
  const modulo = await import("../../lib/liquidacion-pdf.ts").catch(() => null);
  assert.ok(modulo, "debe existir el generador de PDF de liquidaciones");
  assert.equal(typeof modulo.generarPdfLiquidacion, "function");

  const liquidacion = {
    id: 9,
    id_propietario: 4,
    fecha_corrida: new Date("2026-09-15T12:00:00Z"),
    fecha_desde: new Date("2026-09-01T00:00:00Z"),
    fecha_hasta: new Date("2026-09-30T00:00:00Z"),
    monto_bruto: new Decimal("100000"),
    retenciones: new Decimal("12500"),
    adelantos_descontados: new Decimal("5000"),
    monto_neto: new Decimal("82500"),
    estado: "BORRADOR",
    propietario: { id: 4, nombre: "Propietario Ejemplo" },
    items: [
      {
        id: 21,
        id_periodo: 12,
        id_propiedad: 3,
        monto_bruto: new Decimal("100000"),
        comision: new Decimal("10000"),
        gastos: new Decimal("2500"),
        monto_neto: new Decimal("87500"),
        propiedad: { id: 3, direccion: "San Martín 123" },
        periodo: {
          id: 12,
          periodo: "2026-09",
          contrato: {
            id: 7,
            inquilino: { id: 8, nombre: "Inquilino Ejemplo" },
          },
        },
        aplicaciones: [],
        gastos_item: [
          {
            id: 61,
            concepto: "Reparación de techo",
            categoria_interno: null,
            tipo: "ARREGLO",
            monto: new Decimal("2500"),
            estado_pago: "PENDIENTE",
            creado_en: new Date("2026-09-10T12:00:00Z"),
          },
        ],
      },
    ],
    deducciones: [
      {
        id: 31,
        id_transaccion: 41,
        monto_descontado: new Decimal("5000"),
        transaccion: {
          id: 41,
          monto: new Decimal("-5000"),
          fecha_transaccion: new Date("2026-09-01T12:00:00Z"),
          comentario: "Adelanto de septiembre",
        },
      },
    ],
  } as LiquidacionDetalle;

  const pdf = await modulo.generarPdfLiquidacion(liquidacion);

  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.match(pdf.toString("latin1"), /\/MediaBox \[0 0 595\.28 841\.89\]/);
  assert.ok(pdf.length > 2_000, "el PDF debe contener el detalle, no estar vacío");
});

test("omite conceptos que no tienen movimientos", async () => {
  const modulo = await import("../../lib/liquidacion-pdf.ts");
  assert.equal(typeof modulo.obtenerSeccionesPdf, "function");

  assert.deepEqual(
    modulo.obtenerSeccionesPdf({
      items: [
        { id_periodo: 12, gastos_item: [] },
        { id_periodo: null, gastos_item: [] },
      ],
      deducciones: [],
    }),
    ["ALQUILERES"]
  );

  assert.deepEqual(
    modulo.obtenerSeccionesPdf({ items: [], deducciones: [] }),
    []
  );
});
