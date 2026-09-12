import { Suspense } from "react";
import { TablaContratos } from "@/components/features/contratos/TablaContratos";
import { ContratosWizardData } from "@/components/features/contratos/ContratosWizardData";
import { PageHeader } from "@/components/layout/PageHeader";
import { TableLoadingSkeleton } from "@/components/layout/TableLoadingSkeleton";

export default function ContratosPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Gestión de contratos"
        title="Contratos"
        description="Alta, vigencia y estado de cada contrato de alquiler."
        action={
          <Suspense fallback={null}>
            <ContratosWizardData />
          </Suspense>
        }
      />
      <Suspense fallback={<TableLoadingSkeleton />}>
        <TablaContratos />
      </Suspense>
    </div>
  );
}
