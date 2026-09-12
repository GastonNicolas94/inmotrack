import { Suspense } from "react";
import { TablaPropietarios } from "@/components/features/propietarios/TablaPropietarios";
import { PageHeader } from "@/components/layout/PageHeader";
import { TableLoadingSkeleton } from "@/components/layout/TableLoadingSkeleton";

export default function PropietariosPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Caja 1 · Terceros"
        title="Propietarios"
        description="Datos de cobro y propiedades a cargo de cada propietario."
      />
      <Suspense fallback={<TableLoadingSkeleton />}>
        <TablaPropietarios />
      </Suspense>
    </div>
  );
}
