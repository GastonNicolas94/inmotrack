import { prisma } from "@/lib/db";
import type { PropiedadInput } from "@/schemas/propiedad.schema";
import { normalizarParticipaciones } from "@/lib/copropiedad";
import { traceServiceObject } from "@/lib/observability/tracing";

export const PropiedadesService = traceServiceObject("PropiedadesService", {
  async listar(id_propietario?: number) {
    return prisma.propiedad.findMany({
      where: id_propietario
        ? {
            OR: [
              { copropietarios: { some: { id_propietario } } },
              { copropietarios: { none: {} }, id_propietario },
            ],
          }
        : undefined,
      select: {
        id: true,
        direccion: true,
        es_propia: true,
        copropietarios: {
          select: {
            id_propietario: true,
            porcentaje: true,
            propietario: { select: { nombre: true } },
          },
          orderBy: { id_propietario: "asc" },
        },
        _count: { select: { contratos: true } },
      },
      orderBy: { direccion: "asc" },
    });
  },

  // Propiedades sin un contrato ACTIVO/MOROSO/POR_VENCER en curso — usado
  // por el combo de "Nuevo contrato", para no ofrecer una propiedad ya
  // ocupada. POR_VENCER sigue siendo un contrato en curso — no libera la
  // propiedad hasta que efectivamente venza o se rescinda.
  // Un BORRADOR no bloquea; VENCIDO/RESCINDIDO tampoco.
  async listarDisponibles() {
    return prisma.propiedad.findMany({
      where: {
        contratos: { none: { estado: { in: ["ACTIVO", "MOROSO", "POR_VENCER"] } } },
      },
      select: {
        id: true,
        direccion: true,
        propietario: { select: { nombre: true } },
        copropietarios: {
          select: {
            porcentaje: true,
            propietario: { select: { id: true, nombre: true } },
          },
          orderBy: { id_propietario: "asc" },
        },
      },
      orderBy: { direccion: "asc" },
    });
  },

  async obtenerPorId(id: number) {
    return prisma.propiedad.findUnique({
      where: { id },
      include: {
        propietario: true,
        copropietarios: {
          include: { propietario: true },
          orderBy: { id_propietario: "asc" },
        },
        contratos: {
          include: { inquilino: true },
          orderBy: { fecha_inicio: "desc" },
        },
      },
    });
  },

  async crear(data: PropiedadInput) {
    const participaciones = normalizarParticipaciones(data.participaciones);
    const propietarioPrincipal = participaciones[0];

    return prisma.propiedad.create({
      data: {
        direccion: data.direccion,
        es_propia: data.es_propia,
        // Compatibilidad temporal: se conserva el primer propietario en el
        // campo legacy hasta que todos los consumidores migren a copropietarios.
        id_propietario: propietarioPrincipal.id_propietario,
        copropietarios: {
          create: participaciones.map((participacion) => ({
            id_propietario: participacion.id_propietario,
            porcentaje: participacion.porcentaje,
          })),
        },
      },
      include: {
        copropietarios: {
          include: { propietario: true },
          orderBy: { id_propietario: "asc" },
        },
      },
    });
  },

  async actualizar(id: number, data: PropiedadInput) {
    const participaciones = normalizarParticipaciones(data.participaciones);
    const propietarioPrincipal = participaciones[0];

    return prisma.$transaction(async (tx) => {
      await tx.propiedadPropietario.deleteMany({ where: { id_propiedad: id } });

      return tx.propiedad.update({
        where: { id },
        data: {
          direccion: data.direccion,
          es_propia: data.es_propia,
          id_propietario: propietarioPrincipal.id_propietario,
          copropietarios: {
            create: participaciones.map((participacion) => ({
              id_propietario: participacion.id_propietario,
              porcentaje: participacion.porcentaje,
            })),
          },
        },
        include: {
          copropietarios: {
            include: { propietario: true },
            orderBy: { id_propietario: "asc" },
          },
        },
      });
    });
  },
});
