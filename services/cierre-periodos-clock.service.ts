import type { Clock } from "@/lib/clock";
import { AppClock } from "@/lib/app-clock";
import { CierrePeriodosService } from "@/services/cierre-periodos.service";

function fechaCalendario({ anio, mes, dia }: { anio: number; mes: number; dia: number }) {
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export function createCierrePeriodosClockService(clock: Clock) {
  return {
    async encolarContratosVencidos() {
      const fecha = fechaCalendario(await clock.today());
      return CierrePeriodosService.encolarContratosVencidos(fecha);
    },
    async procesarUnaFilaDeCola() {
      const fecha = fechaCalendario(await clock.today());
      return CierrePeriodosService.procesarUnaFilaDeCola(fecha);
    },
  };
}

export const CierrePeriodosClockService = createCierrePeriodosClockService(AppClock);
