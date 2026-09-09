import { PageHeader } from "@/components/layout/PageHeader";
import { TablaLiquidaciones } from "@/components/features/liquidaciones/TablaLiquidaciones";

export default function LiquidacionesPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Caja"
        title="Liquidaciones"
        description="Rendición de cuentas a los propietarios."
      />
      <TablaLiquidaciones />
    </div>
  );
}
