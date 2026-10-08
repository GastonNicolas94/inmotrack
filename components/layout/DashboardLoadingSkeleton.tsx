import { AsyncSectionSkeleton } from "@/components/layout/AsyncSectionSkeleton";

export function DashboardLoadingSkeleton() {
  return <div role="status" aria-label="Abriendo InmoTrack" className="space-y-6">
    <span className="sr-only">Preparando la pantalla, podés seguir navegando.</span>
    <div aria-hidden="true" className="space-y-3">
      <div className="h-3 w-24 animate-pulse rounded bg-muted" />
      <div className="h-8 w-56 animate-pulse rounded bg-muted" />
      <div className="h-3 w-full max-w-lg animate-pulse rounded bg-muted" />
    </div>
    <AsyncSectionSkeleton label="Cargando información" />
  </div>;
}
