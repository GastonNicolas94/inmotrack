import { prisma } from "@/lib/db";
import type { PropietarioInput } from "@/schemas/propietario.schema";

export const PropietariosService = {
  async listar() {
    return prisma.propietario.findMany({
      include: {
        _count: { select: { propiedades: true } },
      },
      orderBy: { nombre: "asc" },
    });
  },

  async obtenerPorId(id: number) {
    return prisma.propietario.findUnique({
      where: { id },
      include: {
        propiedades: {
          include: {
            _count: { select: { contratos: true } },
          },
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
};
