import { AlertCircle, Loader2 } from "lucide-react";

export function DashboardLoadingState({ label = "Cargando dashboard…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
      <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />{label}
    </div>
  );
}

export function DashboardErrorState({ message = "No pudimos cargar los datos del dashboard." }: { message?: string }) {
  return (
    <div role="alert" className="flex min-h-40 items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-4 text-sm text-destructive">
      <AlertCircle aria-hidden className="mr-2 size-4" />{message}
    </div>
  );
}

export function DashboardEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-10 text-center">
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
