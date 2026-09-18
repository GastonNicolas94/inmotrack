import { AlertCircle, ClipboardList, FileCheck2, Receipt, RefreshCcw, WalletCards } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardMetricCard } from "@/components/features/dashboard/DashboardMetricCard";
import { DashboardQuickActions } from "@/components/features/dashboard/DashboardQuickActions";
import { OperationalAlerts } from "@/components/features/dashboard/OperationalAlerts";
import type { OperationalDashboardData } from "@/lib/dashboard/types";

const ars = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const money = (value: string) => ars.format(Number(value));

export function OperationalDashboard({ data }: { data: OperationalDashboardData }) {
  const { metrics } = data;
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Resumen operativo" title="Dashboard" description="La operación diaria de tu cartera, en una sola vista." />
      <section aria-labelledby="operational-kpis" className="space-y-3">
        <h2 id="operational-kpis" className="sr-only">Indicadores operativos</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DashboardMetricCard label="Contratos vigentes" value={metrics.contratosVigentes} icon={FileCheck2} />
          <DashboardMetricCard label="Por vencer" value={metrics.contratosPorVencer} description="Próximos vencimientos" icon={AlertCircle} />
          <DashboardMetricCard label="Ajustes pendientes" value={data.ajustesPendientes} description="Bloquean el avance del período" icon={RefreshCcw} />
          <DashboardMetricCard label="Cuotas vencidas" value={metrics.cuotasVencidas} icon={WalletCards} />
          <DashboardMetricCard label="Monto vencido" value={money(metrics.montoVencido)} icon={WalletCards} />
          <DashboardMetricCard label="Gastos pendientes" value={money(metrics.gastosPendientes.monto)} description={String(metrics.gastosPendientes.cantidad) + " registros"} icon={Receipt} />
          <DashboardMetricCard label="Liquidaciones pendientes" value={money(metrics.liquidacionesPendientes.monto)} description={String(metrics.liquidacionesPendientes.cantidad) + " registros"} icon={ClipboardList} />
        </div>
      </section>
      <DashboardQuickActions />
      <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <OperationalAlerts alerts={data.alerts} />
        <Card><CardHeader><CardTitle>Última actualización</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{data.generatedAt.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}</p></CardContent></Card>
      </section>
    </div>
  );
}
