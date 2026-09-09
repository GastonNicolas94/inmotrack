import { PageHeader } from "@/components/layout/PageHeader";
import { TablaGastos } from "@/components/features/gastos/TablaGastos";

export default function GastosPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Caja"
        title="Gastos"
        description="Arreglos, expensas y gastos propios de la inmobiliaria."
      />
      <TablaGastos />
    </div>
  );
}
