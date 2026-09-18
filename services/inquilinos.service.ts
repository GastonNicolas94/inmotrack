import { prisma } from "@/lib/db";
import { calcularPendiente } from "@/lib/saldos";
import type { InquilinoInput } from "@/schemas/inquilino.schema";
import { traceServiceObject } from "@/lib/observability/tracing";

export const InquilinosService = traceServiceObject("InquilinosService", {
  async listar() {
    return prisma.inquilino.findMany({
      select: {
        id: true,
        nombre: true,
        dni_cuit: true,
        email: true,
        _count: { select: { contratos: true } },
      },
      orderBy: { nombre: "asc" },
    });
  },

  async obtenerPorId(id: number) {
    return prisma.inquilino.findUnique({
      where: { id },
      include: {
        contratos: {
          include: { propiedad: true },
          orderBy: { fecha_inicio: "desc" },
        },
      },
    });
  },

  async crear(data: InquilinoInput) {
    return prisma.inquilino.create({
      data: {
        nombre: data.nombre,
        dni_cuit: data.dni_cuit,
        email: data.email || null,
        telefono: data.telefono || null,
      },
    });
  },

  async obtenerSaldo(id: number) {
    const cargos = await prisma.cargo.findMany({
      where: { contrato: { id_inquilino: id } },
      include: {
        aplicaciones: true,
        periodo: { select: { periodo: true, fecha_vencimiento: true } },
        contrato: { select: { id: true, propiedad: { select: { direccion: true } } } },
      },
    });

    const cargosConPendiente = cargos
      .map((c) => ({ ...c, pendiente: calcularPendiente(c.monto, c.aplicaciones) }))
      .filter((c) => c.pendiente.greaterThan(0));

    const cargosAlquiler = cargosConPendiente.filter((c) => c.tipo === "ALQUILER" || c.tipo === "AJUSTE");
    const cargosPunitorio = cargosConPendiente.filter((c) => c.tipo === "PUNITORIO");
    const cargosGasto = cargosConPendiente.filter((c) => c.tipo === "GASTO");
    const cargosConfeccion = cargosConPendiente.filter((c) => c.tipo === "CONFECCION_CONTRATO");

    const deudaAlquiler = cargosAlquiler.reduce((acc, c) => acc + c.pendiente.toNumber(), 0);
    const punitorios = cargosPunitorio.reduce((acc, c) => acc + c.pendiente.toNumber(), 0);
    const deudaGastos = cargosGasto.reduce((acc, c) => acc + c.pendiente.toNumber(), 0);
    const deudaConfeccion = cargosConfeccion.reduce((acc, c) => acc + c.pendiente.toNumber(), 0);

    return {
      deuda_alquiler: deudaAlquiler,
      punitorios,
      deuda_gastos: deudaGastos,
      deuda_confeccion: deudaConfeccion,
      total: deudaAlquiler + punitorios + deudaGastos + deudaConfeccion,
      detalle_periodos: [...cargosAlquiler, ...cargosPunitorio].map((c) => ({
        id: c.id,
        periodo: c.periodo.periodo,
        tipo: c.tipo,
        monto: Number(c.monto),
        pendiente: c.pendiente.toNumber(),
        fecha_vencimiento: c.periodo.fecha_vencimiento,
      })),
      detalle_gastos: cargosGasto.map((c) => ({
        id: c.id,
        concepto: c.descripcion ?? "",
        monto: c.pendiente.toNumber(),
        direccion: c.contrato.propiedad.direccion,
      })),
      detalle_confeccion: cargosConfeccion.map((c) => ({
        id: c.id,
        concepto: c.descripcion ?? "Confección de contrato",
        monto: c.pendiente.toNumber(),
        direccion: c.contrato.propiedad.direccion,
      })),
    };
  },
});
