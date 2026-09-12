import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { TablaPagos } from "@/components/features/pagos/TablaPagos";
import { TableLoadingSkeleton } from "@/components/layout/TableLoadingSkeleton";

export default function PagosPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Caja"
        title="Pagos"
        description="Actividad de cobros reciente de toda la cartera."
      />
      <Suspense fallback={<TableLoadingSkeleton />}>
        <TablaPagos />
      </Suspense>
    </div>
  );
}
