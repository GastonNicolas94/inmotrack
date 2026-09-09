"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FiltroRangoFecha } from "@/components/features/shared/FiltroRangoFecha";

const TIPOS = [
  "INGRESO_COBRO", "INGRESO_COMISION", "INGRESO_PUNITORIO", "INGRESO_ALQUILER_PROPIO",
  "EGRESO_LIQUIDACION", "EGRESO_TERCEROS", "EGRESO_OPERATIVO", "CONTRA_ASIENTO",
];

export function FiltrosLibroDiario() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setFiltro(clave: string, valor: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (valor) params.set(clave, valor); else params.delete(clave);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Select onValueChange={(v) => setFiltro("tipo", (v as string) === "TODOS" ? "" : (v as string))}>
        <SelectTrigger className="w-48"><SelectValue placeholder="Todos los tipos" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="TODOS">Todos los tipos</SelectItem>
          {TIPOS.map((t) => (
            <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select onValueChange={(v) => setFiltro("caja", (v as string) === "TODAS" ? "" : (v as string))}>
        <SelectTrigger className="w-40"><SelectValue placeholder="Todas las cajas" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="TODAS">Todas las cajas</SelectItem>
          <SelectItem value="TERCEROS">Terceros</SelectItem>
          <SelectItem value="OPERATIVA">Operativa</SelectItem>
        </SelectContent>
      </Select>
      <FiltroRangoFecha />
    </div>
  );
}
