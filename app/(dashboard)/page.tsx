import { OperationalDashboard } from "@/components/features/dashboard/OperationalDashboard";
import { parseDashboardFilters } from "@/lib/dashboard/filters";
import { DashboardService } from "@/services/dashboard.service";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const filters = parseDashboardFilters({});
  const data = await DashboardService.getOperationalData(filters);
  return <OperationalDashboard data={data} />;
}
