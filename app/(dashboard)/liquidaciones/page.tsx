import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { TablaLiquidaciones } from "@/components/features/liquidaciones/TablaLiquidaciones";
import { TableLoadingSkeleton } from "@/components/layout/TableLoadingSkeleton";

export default function LiquidacionesPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Caja"
        title="Liquidaciones"
        description="Rendición de cuentas a los propietarios."
      />
      <Suspense fallback={<TableLoadingSkeleton />}>
        <TablaLiquidaciones />
      </Suspense>
    </div>
  );
}
