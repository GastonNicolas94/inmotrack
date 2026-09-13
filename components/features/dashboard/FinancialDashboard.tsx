import { ArrowDownLeft, ArrowUpRight, CircleDollarSign, Landmark, Receipt, WalletCards } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardMetricCard } from "@/components/features/dashboard/DashboardMetricCard";
import { MonthlyCashFlowChart, ExpenseCategoriesChart, PortfolioCollectionsChart, PropertyCollectionsChart } from "@/components/features/dashboard/DashboardCharts";
import type { FinancialDashboardData } from "@/lib/dashboard/types";

export function FinancialDashboard({ data }: { data: FinancialDashboardData }) {
  const m = data.metrics;
  const ars = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
  const money = (value: string) => ars.format(Number(value));
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Resumen financiero" title="Finanzas" description={"Resultados y flujo de caja para " + data.periodo + "."} />
      <section aria-labelledby="financial-kpis"><h2 id="financial-kpis" className="sr-only">Indicadores financieros</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <DashboardMetricCard label="Cobrado" value={money(m.cobrado)} icon={ArrowDownLeft} />
        <DashboardMetricCard label="Ingresos inmobiliaria" value={money(m.ingresosInmobiliaria)} icon={CircleDollarSign} />
        <DashboardMetricCard label="Gastos operativos" value={money(m.gastosOperativosPagados)} icon={Receipt} />
        <DashboardMetricCard label="Resultado operativo" value={money(m.resultadoOperativo)} icon={ArrowUpRight} />
        <DashboardMetricCard label="Pendiente de liquidar" value={money(m.pendienteLiquidar)} icon={Landmark} />
        <DashboardMetricCard label="Deuda vencida" value={money(m.deudaVencida)} icon={WalletCards} />
      </div></section>
      <MonthlyCashFlowChart rows={data.monthlyCashFlow} />
      <section className="grid gap-4 lg:grid-cols-2"><PortfolioCollectionsChart rows={data.collectionsByPortfolio} /><PropertyCollectionsChart rows={data.collectionsByProperty} /><ExpenseCategoriesChart rows={data.expensesByCategory} /></section>
      {data.unattributedExcluded ? <p className="text-xs text-muted-foreground">Los movimientos sin propiedad atribuible fueron excluidos por el filtro seleccionado.</p> : null}
      <Card><CardHeader><CardTitle>Actualizado</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{data.generatedAt.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}</p></CardContent></Card>
    </div>
  );
}
