import { TablaPropiedades } from "@/components/features/propiedades/TablaPropiedades";
import { PageHeader } from "@/components/layout/PageHeader";

export default function PropiedadesPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Inventario"
        title="Propiedades"
        description="Propiedades administradas y propias, con sus contratos asociados."
      />
      <TablaPropiedades />
    </div>
  );
}
