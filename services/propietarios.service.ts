import { prisma } from "@/lib/db";
import type { PropietarioInput } from "@/schemas/propietario.schema";
import { traceServiceObject } from "@/lib/observability/tracing";

export const PropietariosService = traceServiceObject("PropietariosService", {
  async listar() {
    return prisma.propietario.findMany({
      select: {
        id: true,
        nombre: true,
        cbu: true,
        _count: { select: { participaciones: true } },
      },
      orderBy: { nombre: "asc" },
    });
  },

  async obtenerPorId(id: number) {
    return prisma.propietario.findUnique({
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
  },

  async crear(data: PropietarioInput) {
    return prisma.propietario.create({ data });
  },

  async actualizar(id: number, data: Partial<PropietarioInput>) {
    return prisma.propietario.update({ where: { id }, data });
  },
});
