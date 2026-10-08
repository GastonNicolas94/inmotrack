"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // No account details or server payloads are logged to the browser.
    void error;
  }, [error]);
  return (
    <div role="alert" className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center gap-3">
        <AlertCircle aria-hidden className="size-5 text-primary" />
        <h2 className="font-heading text-[18px] font-bold">No se pudo cargar esta sección</h2>
      </div>
      <p className="mt-2 text-[12px] text-muted-foreground">
        La información no está disponible en este momento. Podés reintentar sin repetir ninguna operación de escritura.
      </p>
      <button type="button" onClick={reset}
        className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-[12px] font-semibold text-primary-foreground">
        <RotateCcw aria-hidden className="size-4" /> Reintentar carga
      </button>
    </div>
  );
}
