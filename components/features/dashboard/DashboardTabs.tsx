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
    <nav aria-label="Sección del dashboard" className="flex gap-1 border-b border-border">
      {TABS.map((tab) => {
        const active = filters.tab === tab.id;
        return (
          <Link
            key={tab.id}
            href={`/?${serializeDashboardFilters(filters, { tab: tab.id })}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
