import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardEmptyState } from "@/components/features/dashboard/DashboardStates";
import { buildBars, buildMonthlyCashFlow } from "@/lib/dashboard/metrics";
import type { ChartBar, FinancialDashboardData } from "@/lib/dashboard/types";

function BarList({ rows }: { rows: ChartBar[] }) {
  if (!rows.length) return <DashboardEmptyState title="Sin datos" description="No hay movimientos para este período." />;
  return (
    <div className="space-y-3" role="img" aria-label="Gráfico de barras">
      {rows.map((row) => (
        <div key={row.label} className="space-y-1">
          <div className="flex justify-between gap-3 text-sm">
            <span className="truncate text-muted-foreground">{row.label}</span>
            <span className="font-medium tabular-nums">{row.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: (row.ratio * 100) + "%" }} /></div>
        </div>
      ))}
    </div>
  );
}

export function MonthlyCashFlowChart({ rows }: { rows: FinancialDashboardData["monthlyCashFlow"] }) {
  const points = buildMonthlyCashFlow(rows);
  return (
    <Card>
      <CardHeader><CardTitle>Flujo mensual</CardTitle><CardDescription>Ingresos y egresos de los últimos seis meses.</CardDescription></CardHeader>
      <CardContent>
        {points.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Flujo mensual de ingresos y egresos</caption><thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 pr-4 font-medium">Período</th><th className="py-2 pr-4 text-right font-medium">Ingresos</th><th className="py-2 text-right font-medium">Egresos</th></tr></thead><tbody>{points.map((point) => <tr key={point.label} className="border-b last:border-0"><th scope="row" className="py-2 pr-4 text-left font-medium">{point.label}</th><td className="py-2 pr-4 text-right tabular-nums text-emerald-600">{point.valueA}</td><td className="py-2 text-right tabular-nums text-rose-600">{point.valueB}</td></tr>)}</tbody></table></div> : <DashboardEmptyState title="Sin movimientos" description="No hay ingresos ni egresos para graficar." />}
      </CardContent>
    </Card>
  );
}

export function PortfolioCollectionsChart({ rows }: { rows: FinancialDashboardData["collectionsByPortfolio"] }) {
  return <Card><CardHeader><CardTitle>Cobros por cartera</CardTitle><CardDescription>Distribución entre propiedades propias y de terceros.</CardDescription></CardHeader><CardContent><BarList rows={buildBars(rows.map((row) => ({ label: row.cartera === "propias" ? "Propias" : "Terceros", value: row.monto })))} /></CardContent></Card>;
}

export function PropertyCollectionsChart({ rows }: { rows: FinancialDashboardData["collectionsByProperty"] }) {
  return <Card><CardHeader><CardTitle>Cobros por propiedad</CardTitle><CardDescription>Propiedades ordenadas por monto cobrado.</CardDescription></CardHeader><CardContent><BarList rows={buildBars(rows.map((row) => ({ label: row.direccion, value: row.monto })))} /></CardContent></Card>;
}

export function ExpenseCategoriesChart({ rows }: { rows: FinancialDashboardData["expensesByCategory"] }) {
  return <Card><CardHeader><CardTitle>Gastos operativos</CardTitle><CardDescription>Gastos agrupados por categoría.</CardDescription></CardHeader><CardContent><BarList rows={buildBars(rows.map((row) => ({ label: row.categoria, value: row.monto })))} /></CardContent></Card>;
}
