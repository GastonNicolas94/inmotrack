import { TablaInquilinos } from "@/components/features/inquilinos/TablaInquilinos";
import { PageHeader } from "@/components/layout/PageHeader";

export default function InquilinosPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Gestión de inquilinos"
        title="Inquilinos"
        description="Datos de contacto, contratos y estado de deuda de cada inquilino."
      />
      <TablaInquilinos />
    </div>
  );
}
