// services/contratos.service.ts
import { Decimal } from "@prisma/client/runtime/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { calcularPendiente } from "@/lib/saldos";
import { partesFechaUTC, calcularVencimientoPeriodo, mesEnArgentina, hoyEnArgentina } from "@/lib/fecha";
import { calcularMontoConfeccion } from "@/lib/confeccion-contrato";
import { aplicarCreditoDisponible } from "@/services/creditos.service";
import type { ContratoInput } from "@/schemas/contrato.schema";

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
  }
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
    },
  });

  // Mismo mecanismo con el que cualquier Cargo nuevo del inquilino consume
  // crédito disponible — la comisión se cobra recién ahora, que la plata
  // queda asignada a un alquiler real.
  await aplicarCreditoDisponible(tx, {
    id_contrato: params.id_contrato,
    id_cargo: cargoAlquiler.id,
    tipo_cargo: "ALQUILER",
    pendiente_cargo: params.monto_alquiler,
    pct_comision: params.pct_comision,
    es_propia: params.es_propia,
    id_usuario_creador: params.id_usuario_creador,
  });

  return periodoPago;
}

export const ContratosService = {
  async listar(filters?: { estado?: string; id_propietario?: number; id_inquilino?: number }) {
    return prisma.contrato.findMany({
      where: {
        ...(filters?.estado ? { estado: filters.estado as never } : {}),
        ...(filters?.id_inquilino ? { id_inquilino: filters.id_inquilino } : {}),
        ...(filters?.id_propietario
          ? { propiedad: { id_propietario: filters.id_propietario } }
          : {}),
      },
      include: {
        propiedad: { include: { propietario: true } },
        inquilino: true,
        _count: { select: { periodos_pago: true } },
      },
      orderBy: { fecha_inicio: "desc" },
    });
  },

  async obtenerPorId(id: number) {
    return prisma.contrato.findUnique({
      where: { id },
      include: {
        propiedad: { include: { propietario: true } },
        inquilino: true,
        periodos_pago: { orderBy: { periodo: "desc" }, take: 12 },
        gastos: { where: { estado_pago: "PENDIENTE" } },
      },
    });
  },

  // Libro mayor de TODO el contrato (todos los períodos, sin filtrar) —
  // usado por la página /contratos/[id]/movimientos. Distinto del
  // resumen agregado que devuelve la ruta /api/v1/contratos/[id]/periodos
  // (una fila por período, para el modal); acá cada Cargo y cada
  // aplicación de pago tiene su propia fila (Debe/Haber/Saldo).
  async obtenerMovimientosContrato(id: number, filtros?: { desde?: Date; hasta?: Date }) {
    const contrato = await prisma.contrato.findUnique({
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

    // El Haber es el COBRO completo (Transaccion.monto), nunca la porción
    // que quedó aplicada a un Cargo puntual — PagosService.registrar deja
    // el sobrante sin persistir a propósito (es la diferencia entre
    // txnCobro.monto y sus AplicacionPago, calculable en cualquier
    // momento). Si mostráramos solo lo aplicado, un pago de $350.000 con
    // $300.000 de deuda apareceria como "$300.000 cobrados" y el sobrante
    // de $50.000 (saldo a favor) desaparecería hasta el día que se
    // consuma contra un cargo futuro. Acá se ve el pago real completo, y
    // el saldo a favor sale solo: en el momento en que el Haber supera el
    // Debe acumulado, el saldo corrido queda negativo — eso ES el crédito.
    const cobros = await prisma.transaccion.findMany({
      where: {
        id_contrato: id,
        OR: [
          { tipo: "INGRESO_COBRO" },
          // Un contra-asiento de una comisión/liquidación (caja OPERATIVA,
          // no es plata del inquilino) no entra acá — solo el que revierte
          // un cobro real del inquilino.
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
        // El período de un cobro es el mes calendario en que ingresó (no
        // necesariamente el mismo período que termina cubriendo — la
        // prelación cobra deuda de CUALQUIER período, sin filtrar).
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

    // El saldo acumulado se calcula sobre la HISTORIA COMPLETA, sin
    // filtrar — el filtro de fecha solo recorta qué filas se muestran
    // después, nunca recalcula el saldo como si la historia anterior no
    // hubiera existido.
    let saldoAcumulado = new Decimal(0);
    let movimientos = entradas.map((e) => {
      saldoAcumulado = saldoAcumulado.plus(e.debe).minus(e.haber);
      return { ...e, saldo: saldoAcumulado };
    });

    if (filtros?.desde) {
      movimientos = movimientos.filter((m) => m.fecha >= filtros.desde!);
    }
    if (filtros?.hasta) {
      movimientos = movimientos.filter((m) => m.fecha <= filtros.hasta!);
    }

    return { contrato, movimientos };
  },

  async crear(data: ContratoInput) {
    return prisma.contrato.create({
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
    return prisma.$transaction(async (tx) => {
      const contrato = await tx.contrato.findUniqueOrThrow({
        where: { id },
        include: { propiedad: true },
      });

      if (contrato.estado !== "BORRADOR") {
        throw new Error("Solo se pueden activar contratos en estado BORRADOR.");
      }

      await tx.contrato.update({ where: { id }, data: { estado: "ACTIVO" } });

      // El primer período se deriva de la fecha de inicio del contrato,
      // no de "hoy" — getters UTC porque fecha_inicio es @db.Date (medianoche
      // UTC; con getters locales en un server en UTC-3 el mes se corre).
      const { anio, mes } = partesFechaUTC(contrato.fecha_inicio);
      const periodo = `${anio}-${String(mes).padStart(2, "0")}`;
      const vencimiento = calcularVencimientoPeriodo(anio, mes);

      // Primer período: nunca hay crédito heredado (no hay período anterior).
      const periodoPago = await abrirPeriodo(tx, {
        id_contrato: id,
        periodo,
        fecha_vencimiento: vencimiento,
        monto_alquiler: new Decimal(contrato.monto_base),
        pct_comision: new Decimal(contrato.pct_comision),
        es_propia: contrato.propiedad.es_propia,
        credito_heredado: new Decimal(0),
        id_usuario_creador,
      });

      // Confección de contrato: a cargo del inquilino, generada una sola
      // vez, en el mismo momento en que se abre el primer período. Nunca
      // puede haber crédito flotante todavía en este instante (es la
      // primera vez que existe algo que cobrar en este contrato), así que
      // no hace falta pasar por aplicarCreditoDisponible.
      if (contrato.cobra_confeccion && contrato.estrategia_confeccion) {
        const montoConfeccion = calcularMontoConfeccion({
          estrategia: contrato.estrategia_confeccion,
          monto_base: contrato.monto_base,
          fecha_inicio: contrato.fecha_inicio,
          fecha_fin: contrato.fecha_fin,
        });

        const gastoConfeccion = await tx.gasto.create({
          data: {
            id_propiedad: contrato.id_propiedad,
            id_contrato: id,
            concepto: "Confección de contrato",
            monto: montoConfeccion,
            tipo: "CONFECCION_CONTRATO",
            cargo_a: "INQUILINO",
          },
        });

        await tx.cargo.create({
          data: {
            id_periodo: periodoPago.id,
            id_contrato: id,
            tipo: "GASTO",
            monto: montoConfeccion,
            id_gasto: gastoConfeccion.id,
            descripcion: "Confección de contrato",
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
    id_usuario_creador: number | null = null
  ) {
    return prisma.$transaction(async (tx) => {
      const contrato = await tx.contrato.findUniqueOrThrow({
        where: { id: id_contrato },
        include: { propiedad: true },
      });

      const periodoAbierto = await tx.periodoPago.findFirst({
        where: { id_contrato, estado_ciclo: "ABIERTO" },
      });

      let creditoHeredado = new Decimal(0);

      if (periodoAbierto) {
        // ── Cierre: calcular el crédito UNA VEZ, transacción por
        // transacción — nunca comparando totales agregados (un pago puede
        // haber cubierto deuda de un Cargo de OTRO período más viejo, y
        // eso no debe contarse como "sobrante de este período"). Este
        // número queda grabado en credito_al_cierre para siempre, aunque
        // en la práctica ya se haya consumido por completo antes de que
        // el período cerrara (ver aplicarCreditoDisponible). ──
        const transaccionesDeCobro = await tx.transaccion.findMany({
          where: { tipo: "INGRESO_COBRO", id_contrato },
          include: { aplicaciones: true },
        });

        let creditoAlCierre = new Decimal(0);
        for (const t of transaccionesDeCobro) {
          const sobrante = calcularPendiente(t.monto, t.aplicaciones);
          if (sobrante.greaterThan(0)) {
            creditoAlCierre = creditoAlCierre.plus(sobrante);
          }
        }

        await tx.periodoPago.update({
          where: { id: periodoAbierto.id },
          data: { estado_ciclo: "CERRADO", credito_al_cierre: creditoAlCierre },
        });

        creditoHeredado = creditoAlCierre;
      }

      // ── Apertura: el Cargo ALQUILER nuevo consume el crédito disponible
      // apenas nace, vía aplicarCreditoDisponible dentro de abrirPeriodo ──
      await abrirPeriodo(tx, {
        id_contrato,
        periodo: nuevoPeriodo,
        fecha_vencimiento: nuevaFechaVencimiento,
        monto_alquiler: new Decimal(contrato.monto_base),
        pct_comision: new Decimal(contrato.pct_comision),
        es_propia: contrato.propiedad.es_propia,
        credito_heredado: creditoHeredado,
        id_usuario_creador,
      });

      return tx.contrato.findUnique({ where: { id: id_contrato } });
    });
  },

  async cambiarEstado(id: number, nuevoEstado: string) {
    if (nuevoEstado === "RESCINDIDO") {
      const cargos = await prisma.cargo.findMany({
        where: { id_contrato: id },
        include: { aplicaciones: true },
      });
      const hayDeuda = cargos.some((c) => calcularPendiente(c.monto, c.aplicaciones).greaterThan(0));
      if (hayDeuda) {
        throw new Error("No se puede rescindir: existen períodos con deuda pendiente.");
      }
    }

    return prisma.contrato.update({
      where: { id },
      data: { estado: nuevoEstado as never },
    });
  },

  // Alerta pura, sin ninguna consecuencia operativa: un ACTIVO cuya
  // fecha_fin cae dentro de los próximos 3 meses pasa a POR_VENCER, para
  // que la inmobiliaria arranque la gestión de renovación. Un MOROSO no
  // se toca — ya tiene su propia señal (cobranza) y, si se pone al día
  // (MOROSO → ACTIVO, en pagos.service.ts), la próxima corrida de esto lo
  // vuelve a evaluar. No filtra por período ni toca ningún Cargo/período —
  // corre junto a encolarContratosVencidos en el mismo cron mensual.
  async marcarContratosPorVencer() {
    const hoy = hoyEnArgentina();
    const hoyStr = `${hoy.anio}-${String(hoy.mes).padStart(2, "0")}-${String(hoy.dia).padStart(2, "0")}`;
    const umbral = new Date(Date.UTC(hoy.anio, hoy.mes - 1 + 3, hoy.dia));
    const umbralStr = `${umbral.getUTCFullYear()}-${String(umbral.getUTCMonth() + 1).padStart(2, "0")}-${String(
      umbral.getUTCDate()
    ).padStart(2, "0")}`;

    const contratos = await prisma.contrato.findMany({
      where: { estado: "ACTIVO" },
      select: { id: true, fecha_fin: true },
    });

    let marcados = 0;
    for (const contrato of contratos) {
      const { anio, mes, dia } = partesFechaUTC(contrato.fecha_fin);
      const finStr = `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
      if (finStr >= hoyStr && finStr <= umbralStr) {
        await prisma.contrato.update({ where: { id: contrato.id }, data: { estado: "POR_VENCER" } });
        marcados++;
      }
    }

    return { marcados };
  },
};
