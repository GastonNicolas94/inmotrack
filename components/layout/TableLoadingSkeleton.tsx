export function TableLoadingSkeleton() {
  return (
    <div
      role="status"
      aria-label="Cargando datos"
      className="space-y-4"
    >
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="h-14 animate-pulse border-b border-border bg-muted" />
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
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
