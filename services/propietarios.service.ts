import { prisma } from "@/lib/db";
import type { PropietarioInput } from "@/schemas/propietario.schema";
import { traceServiceObject } from "@/lib/observability/tracing";

export const PropietariosService = traceServiceObject("PropietariosService", {
  async listar() {
    const propietarios = await prisma.propietario.findMany({
      select: {
        id: true,
        nombre: true,
        cbu: true,
        _count: { select: { participaciones: true } },
      },
      orderBy: { nombre: "asc" },
    });

    return propietarios.map((propietario) => ({
      ...propietario,
      _count: {
        participaciones: propietario._count.participaciones,
        // Alias legacy: evita romper consumidores de la API mientras
        // Propiedad.id_propietario siga existiendo.
        propiedades: propietario._count.participaciones,
      },
    }));
  },

  async obtenerPorId(id: number) {
    const propietario = await prisma.propietario.findUnique({
      where: { id },
      include: {
        participaciones: {
          include: {
            propiedad: {
              include: {
                _count: { select: { contratos: true } },
              },
            },
          },
          orderBy: { id_propiedad: "asc" },
        },
      },
    });

    if (!propietario) return null;

    return {
      ...propietario,
      // Alias de compatibilidad del contrato HTTP histórico. A diferencia
      // de la relación legacy, incluye también propiedades donde este dueño
      // no es el propietario "principal".
      propiedades: propietario.participaciones.map((participacion) => ({
        ...participacion.propiedad,
        porcentaje_participacion: participacion.porcentaje,
      })),
    };
  },

  async crear(data: PropietarioInput) {
    return prisma.propietario.create({ data });
  },

  async actualizar(id: number, data: Partial<PropietarioInput>) {
    return prisma.propietario.update({ where: { id }, data });
  },
});
