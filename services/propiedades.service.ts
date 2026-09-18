import { prisma } from "@/lib/db";
import type { PropiedadInput } from "@/schemas/propiedad.schema";
import { traceServiceObject } from "@/lib/observability/tracing";

export const PropiedadesService = traceServiceObject("PropiedadesService", {
  async listar(id_propietario?: number) {
    return prisma.propiedad.findMany({
      where: id_propietario ? { id_propietario } : undefined,
      select: {
        id: true,
        direccion: true,
        es_propia: true,
        propietario: { select: { nombre: true } },
        _count: { select: { contratos: true } },
      },
      orderBy: { direccion: "asc" },
    });
  },

  // Propiedades sin un contrato ACTIVO/MOROSO/POR_VENCER en curso — usado
  // por el combo de "Nuevo contrato", para no ofrecer una propiedad ya
  // ocupada. POR_VENCER sigue siendo un contrato en curso — no libera la
  // propiedad hasta que efectivamente venza o se rescinda.
  // Un BORRADOR no bloquea (se puede armar más de uno en paralelo y
  // decidir después cuál activar); VENCIDO/RESCINDIDO tampoco, la
  // propiedad vuelve a estar disponible.
  async listarDisponibles() {
    return prisma.propiedad.findMany({
      where: {
        contratos: { none: { estado: { in: ["ACTIVO", "MOROSO", "POR_VENCER"] } } },
      },
      select: {
        id: true,
        direccion: true,
        propietario: { select: { nombre: true } },
      },
      orderBy: { direccion: "asc" },
    });
  },

  async obtenerPorId(id: number) {
    return prisma.propiedad.findUnique({
      where: { id },
      include: {
        propietario: true,
        contratos: {
          include: { inquilino: true },
          orderBy: { fecha_inicio: "desc" },
        },
      },
    });
  },

  async crear(data: PropiedadInput) {
    return prisma.propiedad.create({ data });
  },

  async actualizar(id: number, data: Partial<PropiedadInput>) {
    return prisma.propiedad.update({ where: { id }, data });
  },
});
