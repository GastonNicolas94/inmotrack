import { Suspense } from "react";
import { CajasDashboardService } from "@/services/cajas-dashboard.service";
import { DashboardErrorState } from "@/components/features/dashboard/DashboardStates";
import { DashboardFilters } from "@/components/features/dashboard/DashboardFilters";
import { DashboardTabs } from "@/components/features/dashboard/DashboardTabs";
import { FinancialDashboard } from "@/components/features/dashboard/FinancialDashboard";
import { OperationalDashboard } from "@/components/features/dashboard/OperationalDashboard";
import { CashBalancesCards } from "@/components/features/dashboard/CashBalancesCards";
import { AsyncSectionSkeleton } from "@/components/layout/AsyncSectionSkeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { parseDashboardFilters } from "@/lib/dashboard/filters";
import type { DashboardFilters as FilterState, DashboardSearchParams } from "@/lib/dashboard/types";
import { DashboardClockService } from "@/services/dashboard-clock.service";
import { AppClock } from "@/lib/app-clock";
import { PasswordEmailLanding } from "@/components/features/shared/PasswordEmailLanding";

export const dynamic = "force-dynamic";

type DashboardPageProps = { searchParams?: Promise<DashboardSearchParams> };

/** Only this component performs a GET for property options. */
async function DashboardFilterOptions({ filters }: { filters: FilterState }) {
  const properties = await DashboardClockService.listPropertyOptions().catch(() => []);
  return <DashboardFilters filters={filters} properties={properties} />;
}

function DashboardFilterSkeleton() {
  return <div role="status" aria-label="Cargando filtros" className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
    <span className="sr-only">Cargando opciones de propiedades.</span>
    {Array.from({ length: 4 }, (_, index) => <div key={index} aria-hidden="true" className="space-y-2">
      <div className="h-3 w-16 animate-pulse rounded bg-muted" />
      <div className="h-9 animate-pulse rounded-md bg-muted" />
    </div>)}
  </div>;
}

/** Query results stream independently of the filters and other widgets. */
async function DashboardMetrics({ filters }: { filters: FilterState }) {
  // Catch only query errors here. Rendering errors belong to the route error boundary.
  if (filters.tab === "financiero") {
    const result = await DashboardClockService.getFinancialData(filters)
      .then((data) => ({ ok: true as const, data }))
      .catch(() => ({ ok: false as const }));
    return result.ok
      ? <FinancialDashboard data={result.data} />
      : <DashboardErrorState message="No pudimos cargar este resumen. Probá nuevamente en unos segundos." />;
  }
  const result = await DashboardClockService.getOperationalData(filters)
    .then((data) => ({ ok: true as const, data }))
    .catch(() => ({ ok: false as const }));
  return result.ok
    ? <OperationalDashboard data={result.data} />
    : <DashboardErrorState message="No pudimos cargar este resumen. Probá nuevamente en unos segundos." />;
}

async function FinancialCashBalances() {
  // The two cash boxes must never be mixed; loading them must not gate KPI.
  const balances = await CajasDashboardService.obtenerSaldos().catch(() => null);
  return balances ? <CashBalancesCards balances={balances} /> : null;
}

function CashBoxesSkeleton() {
  return <div role="status" aria-label="Cargando cajas" className="grid gap-3 sm:grid-cols-2">
    <span className="sr-only">Cargando saldos contables.</span>
    <div aria-hidden="true" className="h-40 animate-pulse rounded-lg bg-cash-dark/80" />
    <div aria-hidden="true" className="h-40 animate-pulse rounded-lg border border-border bg-card" />
  </div>;
}

/**
 * Only AppClock / URL filters are awaited before creating the independent
 * Suspense boundaries. User identity is already enforced by dashboard layout.
 */
async function DashboardContent({ searchParams }: DashboardPageProps) {
  const params = searchParams ? await searchParams : {};
  const filters = parseDashboardFilters(params, await AppClock.now());
  const key = [filters.tab, filters.periodo, filters.cartera, filters.propiedadId ?? "todas"].join(":");

  return <div className="space-y-6">
    <DashboardTabs filters={filters} />
    <Suspense key={`filters:${key}`} fallback={<DashboardFilterSkeleton />}>
      <DashboardFilterOptions filters={filters} />
    </Suspense>
    {filters.tab === "financiero" ? (
      <Suspense key={`boxes:${key}`} fallback={<CashBoxesSkeleton />}>
        <FinancialCashBalances />
      </Suspense>
    ) : null}
    <Suspense key={`metrics:${key}`} fallback={<AsyncSectionSkeleton label="Cargando indicadores y gráficos" cards={6} />}>
      <DashboardMetrics filters={filters} />
    </Suspense>
  </div>;
}

export default function DashboardPage({ searchParams }: DashboardPageProps) {
  return <>
    <PasswordEmailLanding />
    <Suspense fallback={<div className="space-y-6">
      <PageHeader eyebrow="Resumen" title="Dashboard" description="Consultando datos de tu cartera…" />
      <AsyncSectionSkeleton label="Preparando dashboard" />
    </div>}>
      <DashboardContent searchParams={searchParams} />
    </Suspense>
  </>;
}
