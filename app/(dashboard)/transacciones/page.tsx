import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { FiltrosLibroDiario } from "@/components/features/transacciones/FiltrosLibroDiario";
import { TablaLibroDiario } from "@/components/features/transacciones/TablaLibroDiario";
import { TableLoadingSkeleton } from "@/components/layout/TableLoadingSkeleton";

export default async function TransaccionesPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; caja?: string; desde?: string; hasta?: string }>;
}) {
  const filtros = await searchParams;
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Contabilidad"
        title="Libro Diario"
        description="Registro inmutable de todos los movimientos de caja."
      />
      <FiltrosLibroDiario />
      <Suspense fallback={<TableLoadingSkeleton />}>
        <TablaLibroDiario filtros={filtros} />
      </Suspense>
    </div>
  );
}
