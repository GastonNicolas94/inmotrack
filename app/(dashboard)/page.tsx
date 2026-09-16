import { DashboardErrorState } from "@/components/features/dashboard/DashboardStates";
import { DashboardFilters } from "@/components/features/dashboard/DashboardFilters";
import { DashboardTabs } from "@/components/features/dashboard/DashboardTabs";
import { FinancialDashboard } from "@/components/features/dashboard/FinancialDashboard";
import { OperationalDashboard } from "@/components/features/dashboard/OperationalDashboard";
import { parseDashboardFilters } from "@/lib/dashboard/filters";
import type { DashboardSearchParams, FinancialDashboardData, OperationalDashboardData } from "@/lib/dashboard/types";
import { DashboardClockService } from "@/services/dashboard-clock.service";
import { AppClock } from "@/lib/app-clock";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams?: Promise<DashboardSearchParams>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = searchParams ? await searchParams : {};
  const filters = parseDashboardFilters(params, await AppClock.now());
  const dataPromise = filters.tab === "financiero"
    ? DashboardClockService.getFinancialData(filters)
    : DashboardClockService.getOperationalData(filters);

  const [propertiesResult, dataResult] = await Promise.allSettled([
    DashboardClockService.listPropertyOptions(),
    dataPromise,
  ]);
  const properties = propertiesResult.status === "fulfilled" ? propertiesResult.value : [];

  return (
    <div className="space-y-6">
      <DashboardTabs filters={filters} />
      <DashboardFilters filters={filters} properties={properties} />
      {dataResult.status === "rejected" ? (
        <DashboardErrorState message="No pudimos cargar este resumen. Probá nuevamente en unos segundos." />
      ) : filters.tab === "financiero" ? (
        <FinancialDashboard data={dataResult.value as FinancialDashboardData} />
      ) : (
        <OperationalDashboard data={dataResult.value as OperationalDashboardData} />
      )}
    </div>
  );
}
