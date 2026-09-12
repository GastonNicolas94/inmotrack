import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { TablaGastos } from "@/components/features/gastos/TablaGastos";
import { TableLoadingSkeleton } from "@/components/layout/TableLoadingSkeleton";

export default function GastosPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Caja"
        title="Gastos"
        description="Arreglos, expensas y gastos propios de la inmobiliaria."
      />
      <Suspense fallback={<TableLoadingSkeleton />}>
        <TablaGastos />
      </Suspense>
    </div>
  );
}
