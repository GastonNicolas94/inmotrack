import { mesEnArgentina } from "@/lib/fecha";
import type { DashboardFilters as DashboardFilterState, DashboardPropertyOption } from "@/lib/dashboard/types";

function addMonths(periodo: string, offset: number): string {
  const [yearText, monthText] = periodo.split("-");
  const absoluteMonth = Number(yearText) * 12 + Number(monthText) - 1 + offset;
  const year = Math.floor(absoluteMonth / 12);
  const month = absoluteMonth % 12 + 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

export function DashboardFilters({
  filters,
  properties,
}: {
  filters: DashboardFilterState;
  properties: DashboardPropertyOption[];
}) {
  const currentPeriod = mesEnArgentina(new Date());
  const periods = Array.from({ length: 24 }, (_, index) => addMonths(currentPeriod, -index));
  if (!periods.includes(filters.periodo)) periods.push(filters.periodo);
  const uniquePeriods = [...new Set(periods)];

  return (
    <form method="get" className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1.5fr_1fr_auto] lg:items-end">
      <input type="hidden" name="tab" value={filters.tab} />
      <label className="grid gap-1 text-sm font-medium">
        <span>Período</span>
        <select name="periodo" defaultValue={filters.periodo} className="h-9 rounded-lg border border-input bg-background px-3 text-sm font-normal">
          {uniquePeriods.map((periodo) => <option key={periodo} value={periodo}>{periodo}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium">
        <span>Propiedad</span>
        <select name="propiedad" defaultValue={filters.propiedadId === null ? "todos" : String(filters.propiedadId)} className="h-9 rounded-lg border border-input bg-background px-3 text-sm font-normal">
          <option value="todos">Todas las propiedades</option>
          {properties.map((property) => <option key={property.id} value={property.id}>{property.direccion}{property.esPropia ? " · Propia" : " · Terceros"}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium">
        <span>Cartera</span>
        <select name="cartera" defaultValue={filters.cartera} className="h-9 rounded-lg border border-input bg-background px-3 text-sm font-normal">
          <option value="todas">Todas</option>
          <option value="propias">Propias</option>
          <option value="terceros">Terceros</option>
        </select>
      </label>
      <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">Aplicar</button>
    </form>
  );
}
