import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-context";
import {
  relojPruebasHabilitado,
  TEST_CLOCK_CONTRACT_COOKIE,
  TEST_CLOCK_COOKIE,
} from "@/lib/reloj-pruebas";
import { RelojPruebas } from "@/components/features/dev/RelojPruebas";

export default async function RelojPruebasPage() {
  if (!relojPruebasHabilitado()) notFound();
  await requireAdmin();

  const store = await cookies();
  const initialFecha = store.get(TEST_CLOCK_COOKIE)?.value ?? "2026-01-15";
  const initialIdContrato = store.get(TEST_CLOCK_CONTRACT_COOKIE)?.value ?? "";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">Herramienta de test</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Reloj de pruebas</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Simulá el paso del tiempo sobre un contrato puntual y ejecutá el cierre de períodos sin cambiar variables de Vercel ni esperar meses reales.
        </p>
      </div>
      <RelojPruebas initialFecha={initialFecha} initialIdContrato={initialIdContrato} />
    </div>
  );
}
