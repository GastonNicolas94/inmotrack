import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-context";
import { relojPruebasHabilitado } from "@/lib/reloj-pruebas";
import { EditableTestClock } from "@/lib/app-clock";
import { RelojPruebas } from "@/components/features/dev/RelojPruebas";

export default async function RelojPruebasPage() {
  if (!relojPruebasHabilitado()) notFound();
  await requireAdmin();

  const initialFecha = (await EditableTestClock.getDate()) ?? "2026-01-15";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">Herramienta de test</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Reloj de pruebas</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Cambiá la fecha global de InmoTrack en este entorno. Dashboard, cron y lógica de negocio deben observar la misma fecha simulada.
        </p>
      </div>
      <RelojPruebas initialFecha={initialFecha} />
    </div>
  );
}
