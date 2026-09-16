import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "@prisma/client/runtime/client";
import { prisma } from "@/lib/db";
import { ContratosService } from "@/services/contratos.service";
import { GastosService } from "@/services/gastos.service";
import { InquilinosService } from "@/services/inquilinos.service";
import { LiquidacionesService } from "@/services/liquidaciones.service";
import { PagosService } from "@/services/pagos.service";
import { PropiedadesService } from "@/services/propiedades.service";
import { PropietariosService } from "@/services/propietarios.service";
import { TransaccionesService } from "@/services/transacciones.service";

type FindManyDelegate = {
  findMany: (args: unknown) => Promise<unknown>;
};

type FindUniqueDelegate = {
  findUnique: (args: unknown) => Promise<unknown>;
};

async function withFindManyStub<T>(
  delegate: FindManyDelegate,
  rows: unknown,
  run: (args: unknown[]) => Promise<T>
) {
  const originalFindMany = delegate.findMany;
  const calls: unknown[] = [];
  delegate.findMany = async (args: unknown) => {
    calls.push(args);
    return rows;
  };

  try {
    return await run(calls);
  } finally {
    delegate.findMany = originalFindMany;
  }
}

async function withFindUniqueStub<T>(
  delegate: FindUniqueDelegate,
  row: unknown,
  run: (args: unknown[]) => Promise<T>
) {
  const originalFindUnique = delegate.findUnique;
  const calls: unknown[] = [];
  delegate.findUnique = async (args: unknown) => {
    calls.push(args);
    return row;
  };

  try {
    return await run(calls);
  } finally {
    delegate.findUnique = originalFindUnique;
  }
}

describe("dashboard list query payloads", () => {
  it("ContratosService.listar selects only fields rendered by TablaContratos", async () => {
    const montoBase = new Decimal("100000.00");
    const rows = [
      {
        id: 1,
        id_propiedad: 2,
        id_inquilino: 3,
        fecha_inicio: new Date("2026-01-01"),
        fecha_fin: new Date("2026-12-31"),
        estado: "ACTIVO",
        monto_base: montoBase,
        propiedad: { direccion: "Calle 1", propietario: { nombre: "Dueño" } },
        inquilino: { nombre: "Inquilino" },
      },
    ];

    await withFindManyStub(prisma.contrato as unknown as FindManyDelegate, rows, async (calls) => {
      const result = await ContratosService.listar();
      assert.deepEqual(result, rows);
      assert(result[0].monto_base instanceof Decimal);
      assert.equal(result[0].monto_base.toString(), "100000");
      assert.deepEqual((calls[0] as { select?: unknown }).select, {
        id: true,
        id_propiedad: true,
        id_inquilino: true,
        fecha_inicio: true,
        fecha_fin: true,
        estado: true,
        monto_base: true,
        indice_act: true,
        meses_act: true,
        ajustes: {
          where: { estado: "PENDIENTE" },
          select: {
            id: true,
            periodo_efectivo: true,
            indice: true,
            monto_anterior: true,
            creado_en: true,
          },
          orderBy: [{ periodo_efectivo: "asc" }, { id: "asc" }],
          take: 1,
        },
        propiedad: { select: { direccion: true, propietario: { select: { nombre: true } } } },
        inquilino: { select: { nombre: true } },
      });
    });
  });

  it("PropiedadesService.listar selects table fields and contract count", async () => {
    const rows = [{
      id: 2,
      direccion: "Calle 1",
      es_propia: false,
      propietario: { nombre: "Dueño" },
      _count: { contratos: 3 },
    }];

    await withFindManyStub(prisma.propiedad as unknown as FindManyDelegate, rows, async (calls) => {
      const result = await PropiedadesService.listar();
      assert.deepEqual(result, rows);
      assert.deepEqual((calls[0] as { select?: unknown }).select, {
        id: true,
        direccion: true,
        es_propia: true,
        propietario: { select: { nombre: true } },
        _count: { select: { contratos: true } },
      });
    });
  });

  it("PropiedadesService.listarDisponibles selects only wizard fields", async () => {
    const rows = [{
      id: 2,
      direccion: "Calle 1",
      propietario: { nombre: "Dueño" },
    }];

    await withFindManyStub(prisma.propiedad as unknown as FindManyDelegate, rows, async (calls) => {
      const result = await PropiedadesService.listarDisponibles();
      assert.deepEqual(result, rows);
      assert.deepEqual((calls[0] as { select?: unknown }).select, {
        id: true,
        direccion: true,
        propietario: { select: { nombre: true } },
      });
    });
  });

  it("InquilinosService.listar selects table fields and contract count", async () => {
    const rows = [{
      id: 3,
      nombre: "Inquilino",
      dni_cuit: "20111111111",
      email: "inquilino@example.com",
      _count: { contratos: 1 },
    }];

    await withFindManyStub(prisma.inquilino as unknown as FindManyDelegate, rows, async (calls) => {
      const result = await InquilinosService.listar();
      assert.deepEqual(result, rows);
      assert.deepEqual((calls[0] as { select?: unknown }).select, {
        id: true,
        nombre: true,
        dni_cuit: true,
        email: true,
        _count: { select: { contratos: true } },
      });
    });
  });

  it("PropietariosService.listar selects table fields and property count", async () => {
    const rows = [{
      id: 4,
      nombre: "Dueño",
      cbu: "0000000000000000000000",
      _count: { propiedades: 2 },
    }];

    await withFindManyStub(prisma.propietario as unknown as FindManyDelegate, rows, async (calls) => {
      const result = await PropietariosService.listar();
      assert.deepEqual(result, rows);
      assert.deepEqual((calls[0] as { select?: unknown }).select, {
        id: true,
        nombre: true,
        cbu: true,
        _count: { select: { propiedades: true } },
      });
    });
  });

  it("PagosService.listarRecientes selects only flattened payment display fields", async () => {
    const montoAplicado = new Decimal("50000.00");
    const fechaPago = new Date("2026-09-12T12:00:00Z");
    const rows = [
      {
        id: 10,
        monto_aplicado: montoAplicado,
        transaccion: { fecha_transaccion: fechaPago },
        cargo: {
          periodo: {
            id_contrato: 20,
            periodo: "2026-09",
            contrato: {
              inquilino: { nombre: "Inquilino" },
              propiedad: { direccion: "Calle 1" },
            },
          },
        },
      },
    ];

    await withFindManyStub(prisma.aplicacionPago as unknown as FindManyDelegate, rows, async (calls) => {
      const result = await PagosService.listarRecientes();
      assert.equal(result[0].fecha, fechaPago);
      assert.equal(result[0].fecha.getTime(), fechaPago.getTime());
      assert.equal(result[0].monto, montoAplicado.toString());
      assert.deepEqual(result, [
        {
          id: 10,
          fecha: fechaPago,
          monto: montoAplicado.toString(),
          contrato_id: 20,
          inquilino: "Inquilino",
          direccion: "Calle 1",
          periodo: "2026-09",
        },
      ]);
      assert.deepEqual((calls[0] as { select?: unknown }).select, {
        id: true,
        monto_aplicado: true,
        transaccion: { select: { fecha_transaccion: true } },
        cargo: {
          select: {
            periodo: {
              select: {
                id_contrato: true,
                periodo: true,
                contrato: {
                  select: {
                    inquilino: { select: { nombre: true } },
                    propiedad: { select: { direccion: true } },
                  },
                },
              },
            },
          },
        },
      });
    });
  });

  it("GastosService.listar selects rendered fields and property address", async () => {
    const rows = [{
      id: 30,
      concepto: "Arreglo",
      categoria_interno: "Mantenimiento",
      monto: "30000.00",
      cargo_a: "PROPIETARIO",
      estado_pago: "PENDIENTE",
      propiedad: { direccion: "Calle 1" },
    }];

    await withFindManyStub(prisma.gasto as unknown as FindManyDelegate, rows, async (calls) => {
      const result = await GastosService.listar();
      assert.deepEqual(result, rows);
      assert.deepEqual((calls[0] as { select?: unknown }).select, {
        id: true,
        concepto: true,
        categoria_interno: true,
        monto: true,
        cargo_a: true,
        estado_pago: true,
        propiedad: { select: { direccion: true } },
      });
    });
  });

  it("LiquidacionesService.listar omits unused items and selects summary fields", async () => {
    const rows = [{
      id: 40,
      id_propietario: 4,
      fecha_corrida: new Date("2026-09-12T12:00:00Z"),
      monto_bruto: "100000.00",
      retenciones: "10000.00",
      monto_neto: "90000.00",
      estado: "PENDIENTE",
      propietario: { nombre: "Dueño" },
    }];

    await withFindManyStub(prisma.liquidacion as unknown as FindManyDelegate, rows, async (calls) => {
      const result = await LiquidacionesService.listar();
      assert.deepEqual(result, rows);
      assert.deepEqual((calls[0] as { select?: unknown }).select, {
        id: true,
        id_propietario: true,
        fecha_corrida: true,
        monto_bruto: true,
        retenciones: true,
        monto_neto: true,
        estado: true,
        propietario: { select: { nombre: true } },
      });
    });
  });

  it("LiquidacionesService.obtenerDetalle returns the complete audit trail in one query", async () => {
    const row = {
      id: 40,
      id_propietario: 4,
      fecha_corrida: new Date("2026-09-12T12:00:00Z"),
      fecha_desde: new Date("2026-09-01"),
      fecha_hasta: new Date("2026-09-30"),
      monto_bruto: "100000.00",
      retenciones: "15000.00",
      adelantos_descontados: "5000.00",
      monto_neto: "80000.00",
      estado: "PENDIENTE",
      propietario: { id: 4, nombre: "Dueño" },
      items: [],
      deducciones: [],
    };
    const service = LiquidacionesService as typeof LiquidacionesService & {
      obtenerDetalle: (id: number) => Promise<unknown>;
    };

    assert.equal(
      typeof service.obtenerDetalle,
      "function",
      "el servicio debe exponer el detalle auditable de una liquidación"
    );

    await withFindUniqueStub(prisma.liquidacion as unknown as FindUniqueDelegate, row, async (calls) => {
      const result = await service.obtenerDetalle(40);
      assert.deepEqual(result, row);
      assert.deepEqual(calls[0], {
        where: { id: 40 },
        select: {
          id: true,
          id_propietario: true,
          fecha_corrida: true,
          fecha_desde: true,
          fecha_hasta: true,
          monto_bruto: true,
          retenciones: true,
          adelantos_descontados: true,
          monto_neto: true,
          estado: true,
          propietario: { select: { id: true, nombre: true } },
          items: {
            select: {
              id: true,
              id_periodo: true,
              id_propiedad: true,
              monto_bruto: true,
              comision: true,
              gastos: true,
              monto_neto: true,
              propiedad: { select: { id: true, direccion: true } },
              periodo: {
                select: {
                  id: true,
                  periodo: true,
                  contrato: {
                    select: {
                      id: true,
                      inquilino: { select: { id: true, nombre: true } },
                    },
                  },
                },
              },
              aplicaciones: {
                select: {
                  id: true,
                  monto_aplicado: true,
                  transaccion: {
                    select: { id: true, tipo: true, fecha_transaccion: true },
                  },
                  cargo: {
                    select: {
                      id: true,
                      tipo: true,
                      monto: true,
                      descripcion: true,
                    },
                  },
                },
                orderBy: { id: "asc" },
              },
              gastos_item: {
                select: {
                  id: true,
                  concepto: true,
                  categoria_interno: true,
                  tipo: true,
                  monto: true,
                  estado_pago: true,
                  creado_en: true,
                },
                orderBy: { id: "asc" },
              },
            },
            orderBy: [{ id_propiedad: "asc" }, { id: "asc" }],
          },
          deducciones: {
            select: {
              id: true,
              id_transaccion: true,
              monto_descontado: true,
              transaccion: {
                select: {
                  id: true,
                  monto: true,
                  fecha_transaccion: true,
                  comentario: true,
                },
              },
            },
            orderBy: { id: "asc" },
          },
        },
      });
    });
  });

  it("TransaccionesService.listar retains contra-asientos and creator email", async () => {
    const rows = [{
      id: 50,
      tipo: "INGRESO_COBRO",
      caja_destino: "TERCEROS",
      monto: "50000.00",
      fecha_transaccion: new Date("2026-09-12T12:00:00Z"),
      usuario_creador: { email: "admin@example.com" },
      contra_asientos: [{ id: 51, tipo: "CONTRA_ASIENTO" }],
    }];

    await withFindManyStub(prisma.transaccion as unknown as FindManyDelegate, rows, async (calls) => {
      const result = await TransaccionesService.listar();
      assert.deepEqual(result, rows);
      assert.deepEqual((calls[0] as { select?: unknown }).select, {
        id: true,
        tipo: true,
        caja_destino: true,
        monto: true,
        fecha_transaccion: true,
        usuario_creador: { select: { email: true } },
        contra_asientos: { select: { id: true, tipo: true } },
      });
    });
  });
});