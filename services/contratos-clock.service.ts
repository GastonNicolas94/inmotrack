import { prisma } from "@/lib/db";
import { AppClock } from "@/lib/app-clock";
import { partesFechaUTC } from "@/lib/fecha";

export const ContratosClockService = {
  async marcarContratosPorVencer() {
    const hoy = await AppClock.today();
    const hoyStr = `${hoy.anio}-${String(hoy.mes).padStart(2, "0")}-${String(hoy.dia).padStart(2, "0")}`;
    const umbral = new Date(Date.UTC(hoy.anio, hoy.mes - 1 + 3, hoy.dia));
    const umbralStr = `${umbral.getUTCFullYear()}-${String(umbral.getUTCMonth() + 1).padStart(2, "0")}-${String(umbral.getUTCDate()).padStart(2, "0")}`;

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
