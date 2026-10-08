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
          <Suspense fallback={<span role="status" aria-label="Preparando formulario de contrato" className="inline-flex h-10 w-full items-center justify-center rounded-md border border-border bg-muted px-4 text-[11px] font-semibold text-muted-foreground sm:w-40">Preparando formulario…</span>}>
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
