import { Suspense } from "react";
import { TablaInquilinos } from "@/components/features/inquilinos/TablaInquilinos";
import { PageHeader } from "@/components/layout/PageHeader";
import { TableLoadingSkeleton } from "@/components/layout/TableLoadingSkeleton";

export default function InquilinosPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Gestión de inquilinos"
        title="Inquilinos"
        description="Datos de contacto, contratos y estado de deuda de cada inquilino."
      />
      <Suspense fallback={<TableLoadingSkeleton />}>
        <TablaInquilinos />
      </Suspense>
    </div>
  );
}
