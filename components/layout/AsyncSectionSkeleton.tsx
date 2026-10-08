/**
 * Shared fallback for read-only RSC sections.
 * The shell stays interactive while GET queries resolve behind Suspense.
 */
export function AsyncSectionSkeleton({
  label = "Cargando información",
  cards = 4,
}: {
  label?: string;
  cards?: number;
}) {
  return (
    <section role="status" aria-live="polite" aria-label={label} className="space-y-4">
      <span className="sr-only">{label}. Podés seguir navegando.</span>
      <div aria-hidden="true" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: cards }, (_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-lg border border-border bg-card p-4">
            <div className="h-3 w-2/3 rounded bg-muted" />
            <div className="mt-7 h-6 w-3/4 rounded bg-muted" />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="h-48 animate-pulse rounded-lg border border-border bg-card p-5">
        <div className="h-4 w-2/5 rounded bg-muted" />
        <div className="mt-6 h-3 w-3/4 rounded bg-muted" />
        <div className="mt-5 h-3 w-1/2 rounded bg-muted" />
      </div>
    </section>
  );
}
