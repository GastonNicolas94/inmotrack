"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";

/**
 * Dos inputs de fecha (desde/hasta) que escriben en la querystring de la
 * página actual — mismo patrón que el resto de los filtros de la app
 * (sin estado de cliente, todo vía URL). Compartido entre /transacciones
 * y el libro mayor de un contrato.
 */
export function FiltroRangoFecha() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setFiltro(clave: string, valor: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (valor) params.set(clave, valor); else params.delete(clave);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <>
      <Input type="date" className="w-40" onChange={(e) => setFiltro("desde", e.target.value)} />
      <Input type="date" className="w-40" onChange={(e) => setFiltro("hasta", e.target.value)} />
    </>
  );
}
