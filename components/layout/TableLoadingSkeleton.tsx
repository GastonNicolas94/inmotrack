/** Presentation-only fallback: no queries, no writes, no runtime dependencies. */
export function TableLoadingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite" aria-label="Cargando listado" className="space-y-3">
      <span className="sr-only">Cargando listado, podés seguir navegando.</span>
      <div aria-hidden="true" className="flex flex-wrap items-center justify-between gap-3">
        <div className="h-9 w-full max-w-[340px] animate-pulse rounded-md bg-muted sm:w-[340px]" />
        <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
      </div>
      <div aria-hidden="true" className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
        <div className="h-10 animate-pulse border-b border-border bg-muted" />
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex h-12 items-center gap-4 border-b border-border px-4 last:border-b-0">
            <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
            <div className="ml-auto h-3 w-24 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="grid gap-3 md:hidden">
        {Array.from({ length: Math.min(rows, 4) }, (_, index) => (
          <div key={index} className="space-y-3 rounded-lg border border-border bg-card p-4">
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-2/5 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
