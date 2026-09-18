// services/contratos.service.ts
import { Decimal } from "@prisma/client/runtime/client";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Clock } from "@/lib/clock";
import { AppClock } from "@/lib/app-clock";
import { calcularPendiente } from "@/lib/saldos";
import { partesFechaUTC, calcularVencimientoPeriodo, mesEnArgentina } from "@/lib/fecha";
import { calcularMontoConfeccion } from "@/lib/confeccion-contrato";
import { requiereAjuste } from "@/lib/ajustes-contrato";
import { aplicarCreditoDisponible } from "@/services/creditos.service";
import { AjustesContratoService } from "@/services/ajustes-contrato.service";
import type { ContratoInput } from "@/schemas/contrato.schema";
import { traceServiceObject } from "@/lib/observability/tracing";

async function abrirPeriodo(
  tx: Prisma.TransactionClient,
  params: {
    id_contrato: number;
    periodo: string;
    fecha_vencimiento: Date;
    monto_alquiler: Decimal;
    pct_comision: Decimal;
    es_propia: boolean;
    credito_heredado: Decimal;
    id_usuario_creador: number | null;
    ahora: Date;
  },
) {
  const periodoPago = await tx.periodoPago.create({
    data: {
      id_contrato: params.id_contrato,
      periodo: params.periodo,
      fecha_vencimiento: params.fecha_vencimiento,
      estado_ciclo: "ABIERTO",
      credito_heredado: params.credito_heredado,
    },
  });

  const cargoAlquiler = await tx.cargo.create({
    data: {
      id_periodo: periodoPago.id,
      id_contrato: params.id_contrato,
      tipo: "ALQUILER",
      monto: params.monto_alquiler,
      creado_en: params.ahora,
    },
  });

  await aplicarCreditoDisponible(tx, {
    id_contrato: params.id_contrato,
    id_cargo: cargoAlquiler.id,
    tipo_cargo: "ALQUILER",
    pendiente_cargo: params.monto_alquiler,
    pct_comision: params.pct_comision,
    es_propia: params.es_propia,
    id_usuario_creador: params.id_usuario_creador,
    fecha_transaccion: params.ahora,
  });

  return periodoPago;
}

type Dependencies = { prisma: PrismaClient; clock: Clock };

export function createContratosService(deps: Dependencies) {
  return {
    async listar(filters?: { estado?: string; id_propietario?: number; id_inquilino?: number }) {
      return deps.prisma.contrato.findMany({
        where: {
          ...(filters?.estado ? { estado: filters.estado as never } : {}),
          ...(filters?.id_inquilino ? { id_inquilino: filters.id_inquilino } : {}),
          ...(filters?.id_propietario ? { propiedad: { id_propietario: filters.id_propietario } } : {}),
        },
        select: {
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
          propiedad: {
            select: {
              direccion: true,
              propietario: { select: { nombre: true } },
            },
          },
          inquilino: { select: { nombre: true } },
        },
        orderBy: { fecha_inicio: "desc" },
      });
    },

    async obtenerPorId(id: number) {
      return deps.prisma.contrato.findUnique({
        where: { id },
        include: {
          propiedad: { include: { propietario: true } },
          inquilino: true,
          periodos_pago: { orderBy: { periodo: "desc" }, take: 12 },
          gastos: { where: { estado_pago: "PENDIENTE" } },
          ajustes: {
            include: { usuario_aplicador: { select: { id: true, email: true } } },
            orderBy: [{ periodo_efectivo: "desc" }, { creado_en: "desc" }],
          },
        },
      });
    },

    async obtenerMovimientosContrato(id: number, filtros?: { desde?: Date; hasta?: Date }) {
      const contrato = await deps.prisma.contrato.findUnique({
        where: { id },
        include: {
          inquilino: true,
          propiedad: { include: { propietario: true } },
          periodos_pago: {
            include: { cargos: true },
            orderBy: { periodo: "asc" },
          },
        },
      });
      if (!contrato) return null;

      const cobros = await deps.prisma.transaccion.findMany({
        where: {
          id_contrato: id,
          OR: [
            { tipo: "INGRESO_COBRO" },
            { tipo: "CONTRA_ASIENTO", txn_origen: { tipo: "INGRESO_COBRO" } },
          ],
        },
        include: { usuario_creador: { select: { id: true, email: true } } },
        orderBy: { fecha_transaccion: "asc" },
      });

      const entradas: {
        fecha: Date;
        periodo: string;
        esCargo: boolean;
        tipo: string;
        descripcion: string | null;
        usuario: string | null;
        debe: Decimal;
        haber: Decimal;
      }[] = [];

      for (const periodo of contrato.periodos_pago) {
        for (const cargo of periodo.cargos) {
          entradas.push({
            fecha: cargo.creado_en,
            periodo: periodo.periodo,
            esCargo: true,
            tipo: cargo.tipo,
            descripcion: cargo.descripcion,
            usuario: null,
            debe: new Decimal(cargo.monto),
            haber: new Decimal(0),
          });
        }
      }
      for (const cobro of cobros) {
        entradas.push({
          fecha: cobro.fecha_transaccion,
          periodo: mesEnArgentina(cobro.fecha_transaccion),
          esCargo: false,
          tipo: cobro.tipo,
          descripcion: cobro.comentario,
          usuario: cobro.usuario_creador?.email ?? null,
          debe: new Decimal(0),
          haber: new Decimal(cobro.monto),
        });
      }
      entradas.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

      let saldoAcumulado = new Decimal(0);
      let movimientos = entradas.map((e) => {
        saldoAcumulado = saldoAcumulado.plus(e.debe).minus(e.haber);
        return { ...e, saldo: saldoAcumulado };
      });

      if (filtros?.desde) movimientos = movimientos.filter((m) => m.fecha >= filtros.desde!);
      if (filtros?.hasta) movimientos = movimientos.filter((m) => m.fecha <= filtros.hasta!);

      return { contrato, movimientos };
    },

    async crear(data: ContratoInput) {
      return deps.prisma.contrato.create({
        data: {
          id_propiedad: data.id_propiedad,
          id_inquilino: data.id_inquilino,
          fecha_inicio: new Date(data.fecha_inicio),
          fecha_fin: new Date(data.fecha_fin),
          monto_base: data.monto_base,
          pct_comision: data.pct_comision,
          pct_punitorio_diario: data.pct_punitorio_diario,
          indice_act: data.indice_act ?? null,
          meses_act: data.meses_act ?? null,
          cobra_confeccion: data.cobra_confeccion ?? false,
          estrategia_confeccion: data.estrategia_confeccion ?? null,
        },
      });
    },

    async activar(id: number, id_usuario_creador: number | null = null) {
      const ahora = await deps.clock.now();
      return deps.prisma.$transaction(async (tx) => {
        const contrato = await tx.contrato.findUniqueOrThrow({
          where: { id },
          include: { propiedad: true },
        });

        if (contrato.estado !== "BORRADOR") {
          throw new Error("Solo se pueden activar contratos en estado BORRADOR.");
        }

        await tx.contrato.update({ where: { id }, data: { estado: "ACTIVO" } });

        const { anio, mes } = partesFechaUTC(contrato.fecha_inicio);
        const periodo = `${anio}-${String(mes).padStart(2, "0")}`;
        const vencimiento = calcularVencimientoPeriodo(anio, mes);

        const periodoPago = await abrirPeriodo(tx, {
          id_contrato: id,
          periodo,
          fecha_vencimiento: vencimiento,
          monto_alquiler: new Decimal(contrato.monto_base),
          pct_comision: new Decimal(contrato.pct_comision),
          es_propia: contrato.propiedad.es_propia,
          credito_heredado: new Decimal(0),
          id_usuario_creador,
          ahora,
        });

        if (contrato.cobra_confeccion && contrato.estrategia_confeccion) {
          const montoConfeccion = calcularMontoConfeccion({
            estrategia: contrato.estrategia_confeccion,
            monto_base: contrato.monto_base,
            fecha_inicio: contrato.fecha_inicio,
            fecha_fin: contrato.fecha_fin,
          });

          await tx.cargo.create({
            data: {
              id_periodo: periodoPago.id,
              id_contrato: id,
              tipo: "CONFECCION_CONTRATO",
              monto: montoConfeccion,
              descripcion: "Confección de contrato",
              creado_en: ahora,
            },
          });
        }

        return tx.contrato.findUnique({ where: { id } });
      });
    },

    async avanzarPeriodo(
      id_contrato: number,
      nuevoPeriodo: string,
      nuevaFechaVencimiento: Date,
      id_usuario_creador: number | null = null,
    ) {
      const ahora = await deps.clock.now();
      return deps.prisma.$transaction(async (tx) => {
        const contrato = await tx.contrato.findUniqueOrThrow({
          where: { id: id_contrato },
          include: { propiedad: true },
        });

        if (
          requiereAjuste({
            fechaInicio: contrato.fecha_inicio,
            fechaUltimoAjuste: contrato.fecha_ultimo_ajuste,
            mesesActualizacion: contrato.meses_act,
            indiceActualizacion: contrato.indice_act,
            periodoObjetivo: nuevoPeriodo,
          })
        ) {
          const ajuste = await AjustesContratoService.crearOReutilizarPendiente(tx, contrato, nuevoPeriodo);
          return { estado: "AJUSTE_PENDIENTE" as const, ajusteId: ajuste.id };
        }

        const periodoAbierto = await tx.periodoPago.findFirst({
          where: { id_contrato, estado_ciclo: "ABIERTO" },
        });

        let creditoHeredado = new Decimal(0);

        if (periodoAbierto) {
          const transaccionesDeCobro = await tx.transaccion.findMany({
            where: { tipo: "INGRESO_COBRO", id_contrato },
            include: { aplicaciones: true },
          });

          let creditoAlCierre = new Decimal(0);
          for (const t of transaccionesDeCobro) {
            const sobrante = calcularPendiente(t.monto, t.aplicaciones);
            if (sobrante.greaterThan(0)) creditoAlCierre = creditoAlCierre.plus(sobrante);
          }

          await tx.periodoPago.update({
            where: { id: periodoAbierto.id },
            data: { estado_ciclo: "CERRADO", credito_al_cierre: creditoAlCierre },
          });

          creditoHeredado = creditoAlCierre;
        }

        await abrirPeriodo(tx, {
          id_contrato,
          periodo: nuevoPeriodo,
          fecha_vencimiento: nuevaFechaVencimiento,
          monto_alquiler: new Decimal(contrato.monto_base),
          pct_comision: new Decimal(contrato.pct_comision),
          es_propia: contrato.propiedad.es_propia,
          credito_heredado: creditoHeredado,
          id_usuario_creador,
          ahora,
        });

        const contratoActualizado = await tx.contrato.findUnique({ where: { id: id_contrato } });
        return { estado: "AVANZADO" as const, contrato: contratoActualizado };
      });
    },

    async cambiarEstado(id: number, nuevoEstado: string) {
      if (nuevoEstado === "RESCINDIDO") {
        const cargos = await deps.prisma.cargo.findMany({
          where: { id_contrato: id },
          include: { aplicaciones: true },
        });
        const hayDeuda = cargos.some((c) => calcularPendiente(c.monto, c.aplicaciones).greaterThan(0));
        if (hayDeuda) {
          throw new Error("No se puede rescindir: existen períodos con deuda pendiente.");
        }
      }

      return deps.prisma.contrato.update({
        where: { id },
        data: { estado: nuevoEstado as never },
      });
    },

    async marcarContratosPorVencer() {
      const hoy = await deps.clock.today();
      const hoyStr = `${hoy.anio}-${String(hoy.mes).padStart(2, "0")}-${String(hoy.dia).padStart(2, "0")}`;
      const umbral = new Date(Date.UTC(hoy.anio, hoy.mes - 1 + 3, hoy.dia));
      const umbralStr = `${umbral.getUTCFullYear()}-${String(umbral.getUTCMonth() + 1).padStart(2, "0")}-${String(umbral.getUTCDate()).padStart(2, "0")}`;

      const contratos = await deps.prisma.contrato.findMany({
        where: { estado: "ACTIVO" },
        select: { id: true, fecha_fin: true },
      });

      let marcados = 0;
      for (const contrato of contratos) {
        const { anio, mes, dia } = partesFechaUTC(contrato.fecha_fin);
        const finStr = `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
        if (finStr >= hoyStr && finStr <= umbralStr) {
          await deps.prisma.contrato.update({ where: { id: contrato.id }, data: { estado: "POR_VENCER" } });
          marcados++;
        }
      }

      return { marcados };
    },
  };
}

export const ContratosService = traceServiceObject("ContratosService", createContratosService({ prisma, clock: AppClock }));
