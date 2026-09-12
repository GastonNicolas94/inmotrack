import { Suspense } from "react";
import { TablaPropiedades } from "@/components/features/propiedades/TablaPropiedades";
import { PageHeader } from "@/components/layout/PageHeader";
import { TableLoadingSkeleton } from "@/components/layout/TableLoadingSkeleton";

export default function PropiedadesPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Inventario"
        title="Propiedades"
        description="Propiedades administradas y propias, con sus contratos asociados."
      />
      <Suspense fallback={<TableLoadingSkeleton />}>
        <TablaPropiedades />
      </Suspense>
    </div>
  );
}
