import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidElement,
  type ComponentType,
  type ReactNode,
} from "react";
import { hrefDetalleLiquidacion } from "../../lib/liquidacion-detalle.ts";

function textoDelArbol(node: ReactNode) {
  const textos: string[] = [];
  const visitar = (valor: ReactNode) => {
    if (Array.isArray(valor)) {
      valor.forEach(visitar);
      return;
    }
    if (typeof valor === "string" || typeof valor === "number") {
      textos.push(String(valor));
      return;
    }
    if (!isValidElement(valor)) return;
    visitar((valor.props as { children?: ReactNode }).children);
  };
  visitar(node);
  return textos.join(" ");
}

test("construye la navegación a la página de detalle de una liquidación", () => {
  assert.equal(hrefDetalleLiquidacion(9), "/liquidaciones/9");
});

test("el detalle muestra cargos cobrados, gastos y adelantos que forman el neto", async () => {
  const modulo = await import("../../components/features/liquidaciones/DetalleLiquidacion.tsx").catch(
    () => null
  );
  assert.ok(modulo, "debe existir la vista de detalle de liquidación");

  const DetalleLiquidacion = modulo.DetalleLiquidacion as ComponentType<{ liquidacion: unknown }>;
  const vista = DetalleLiquidacion({
    liquidacion: {
        id: 9,
        id_propietario: 4,
        fecha_corrida: new Date("2026-09-14T15:30:00Z"),
        fecha_desde: new Date("2026-09-01"),
        fecha_hasta: new Date("2026-09-30"),
        monto_bruto: "100000.00",
        retenciones: "15000.00",
        adelantos_descontados: "5000.00",
        monto_neto: "80000.00",
        estado: "PENDIENTE",
        propietario: { id: 4, nombre: "Ana Propietaria" },
        items: [
          {
            id: 21,
            id_periodo: 11,
            id_propiedad: 7,
            monto_bruto: "100000.00",
            comision: "10000.00",
            gastos: "0",
            monto_neto: "90000.00",
            propiedad: { id: 7, direccion: "San Martín 123" },
            periodo: {
              id: 11,
              periodo: "2026-09",
              contrato: {
                id: 3,
                inquilino: { id: 8, nombre: "Juan Inquilino" },
              },
            },
            aplicaciones: [
              {
                id: 31,
                monto_aplicado: "100000.00",
                transaccion: {
                  id: 41,
                  tipo: "INGRESO_COBRO",
                  fecha_transaccion: new Date("2026-09-10T15:00:00Z"),
                },
                cargo: { id: 51, tipo: "ALQUILER", monto: "100000.00", descripcion: null },
              },
            ],
            gastos_item: [],
          },
          {
            id: 22,
            id_periodo: null,
            id_propiedad: 7,
            monto_bruto: "0",
            comision: "0",
            gastos: "5000.00",
            monto_neto: "-5000.00",
            propiedad: { id: 7, direccion: "San Martín 123" },
            periodo: null,
            aplicaciones: [],
            gastos_item: [
              {
                id: 61,
                concepto: "Reparación de techo",
                categoria_interno: "Mantenimiento",
                tipo: "ARREGLO",
                monto: "5000.00",
                estado_pago: "PAGADO_PROVEEDOR",
                creado_en: new Date("2026-09-11T12:00:00Z"),
              },
            ],
          },
        ],
        deducciones: [
          {
            id: 71,
            id_transaccion: 81,
            monto_descontado: "5000.00",
            transaccion: {
              id: 81,
              monto: "-20000.00",
              fecha_transaccion: new Date("2026-09-05T12:00:00Z"),
              comentario: "Adelanto de septiembre",
            },
          },
        ],
    },
  });
  const html = textoDelArbol(vista);

  assert.match(html, /Alquileres cobrados/);
  assert.match(html, /San Martín 123/);
  assert.match(html, /Juan Inquilino/);
  assert.match(html, /Cargo #\s*51/);
  assert.match(html, /Transacción #\s*41/);
  assert.match(html, /10\.00\s*%/);
  assert.match(html, /Reparación de techo/);
  assert.match(html, /Gasto #\s*61/);
  assert.match(html, /Adelanto de septiembre/);
  assert.match(html, /Adelantos descontados/);
  assert.match(html, /Neto a pagar/);
});
