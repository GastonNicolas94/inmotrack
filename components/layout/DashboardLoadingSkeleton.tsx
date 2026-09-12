export function DashboardLoadingSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="space-y-8"
    >
      <span className="sr-only">Cargando…</span>

      <div className="space-y-4 border-b border-border pb-8">
        <div
          aria-hidden="true"
          className="h-3 w-24 animate-pulse rounded-2xl bg-muted"
        />
        <div
          aria-hidden="true"
          className="h-12 w-3/4 max-w-lg animate-pulse rounded-2xl bg-muted"
        />
        <div
          aria-hidden="true"
          className="h-5 w-full max-w-2xl animate-pulse rounded-2xl bg-muted"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div
          aria-hidden="true"
          className="h-14 animate-pulse border-b border-border bg-muted"
        />
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            aria-hidden="true"
            className="flex h-16 items-center gap-4 border-b border-border px-5 last:border-b-0"
          >
            <div className="h-4 w-1/4 animate-pulse rounded-2xl bg-muted" />
            <div className="h-4 w-1/3 animate-pulse rounded-2xl bg-muted" />
            <div className="ml-auto h-4 w-20 animate-pulse rounded-2xl bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
