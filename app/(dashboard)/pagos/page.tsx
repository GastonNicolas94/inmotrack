import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { CobranzasListado } from "@/components/features/cobranzas/CobranzasListado";
import { TablaPagos } from "@/components/features/pagos/TablaPagos";
import { TableLoadingSkeleton } from "@/components/layout/TableLoadingSkeleton";
import type { FiltroCobranza } from "@/lib/cobranzas";

export default async function PagosPage({
  searchParams,
}: {
  searchParams?: Promise<{ estado?: string; q?: string }>;
}) {
  const params = await searchParams;
  const estado = params?.estado;
  const filtro: FiltroCobranza = estado === "pendientes" || estado === "vencidos" || estado === "cobrados" ? estado : "todos";
  const q = (params?.q ?? "").slice(0, 120);

  return <div className="space-y-8">
    <div>
      <PageHeader eyebrow="Gestión de cobranza" title="Cobros" description="Seguimiento de cargos por período, vencimientos y saldos pendientes." />
      <Suspense fallback={<TableLoadingSkeleton />}>
        <CobranzasListado filtro={filtro} q={q} />
      </Suspense>
    </div>
    <section aria-labelledby="historial-pagos" className="space-y-3">
      <h2 id="historial-pagos" className="font-heading text-[18px] font-bold">Últimos pagos registrados</h2>
      <p className="text-[11px] text-muted-foreground">Historial de aplicaciones recientes a cargos de alquiler.</p>
      <Suspense fallback={<TableLoadingSkeleton />}><TablaPagos /></Suspense>
    </section>
  </div>;
}
