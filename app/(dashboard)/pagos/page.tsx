import { PageHeader } from "@/components/layout/PageHeader";
import { TablaPagos } from "@/components/features/pagos/TablaPagos";

export default function PagosPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Caja"
        title="Pagos"
        description="Actividad de cobros reciente de toda la cartera."
      />
      <TablaPagos />
    </div>
  );
}
