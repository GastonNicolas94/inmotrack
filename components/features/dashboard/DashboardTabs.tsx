import Link from "next/link";
import { cn } from "@/lib/utils";
import { serializeDashboardFilters } from "@/lib/dashboard/filters";
import type { DashboardFilters, DashboardTab } from "@/lib/dashboard/types";

const TABS: Array<{ id: DashboardTab; label: string }> = [
  { id: "operativo", label: "Operativo diario" },
  { id: "financiero", label: "Financiero" },
];

export function DashboardTabs({ filters }: { filters: DashboardFilters }) {
  return (
    <>
      <nav aria-label="Sección del dashboard" className="inmotrack-dashboard-tabs inmotrack-desktop-only flex gap-1 border-b border-border">
        {TABS.map((tab) => {
          const active = filters.tab === tab.id;
          return <Link key={tab.id} href={`/?${serializeDashboardFilters(filters, { tab: tab.id })}`}
            aria-current={active ? "page" : undefined}
            className={cn("border-b-2 px-3 py-2 text-[12px] font-medium transition-colors",
              active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:border-border hover:text-foreground")}>{tab.label}</Link>;
        })}
      </nav>
      <form method="get" className="inmotrack-mobile-only flex items-center gap-2">
        <label htmlFor="dashboard-tab" className="shrink-0 text-[11px] font-semibold text-muted-foreground">Vista</label>
        <select id="dashboard-tab" name="tab" defaultValue={filters.tab}
          className="h-10 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-[12px] font-semibold">
          {TABS.map((tab) => <option key={tab.id} value={tab.id}>{tab.label}</option>)}
        </select>
        <input type="hidden" name="periodo" value={filters.periodo} />
        <input type="hidden" name="propiedad" value={filters.propiedadId === null ? "todos" : String(filters.propiedadId)} />
        <input type="hidden" name="cartera" value={filters.cartera} />
        <button type="submit" className="h-10 rounded-md bg-primary px-4 text-[12px] font-semibold text-primary-foreground">Ver</button>
      </form>
    </>
  );
}
