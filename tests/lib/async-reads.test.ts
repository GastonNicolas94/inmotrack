import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Architecture regression checks: GETs are streamed, but auth and mutations
 * are never downgraded to optimistic client-only updates.
 * Not a substitute for e2e latency and auth testing.
 */
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const readOnlyPages = [
  "contratos", "propiedades", "propietarios", "inquilinos",
  "gastos", "liquidaciones", "pagos", "transacciones",
];
for (const name of readOnlyPages) {
  test(`GET listado ${name} está detrás de Suspense`, () => {
    const source = read(`app/(dashboard)/${name}/page.tsx`);
    assert.match(source, /<Suspense\s+fallback=/);
    assert.match(source, /TableLoadingSkeleton/);
    assert.match(source, /<PageHeader/);
  });
}

test("Dashboard no espera en Promise.allSettled a todas las consultas", () => {
  const source = read("app/(dashboard)/page.tsx");
  assert.doesNotMatch(source, /await Promise\.allSettled/);
  assert.match(source, /<DashboardContent\s+searchParams=/);
  assert.match(source, /<DashboardFilterOptions\s+filters=/);
  assert.match(source, /<FinancialCashBalances\s*\/>/);
  assert.match(source, /<DashboardMetrics\s+filters=/);
  assert.ok((source.match(/<Suspense\s/g) ?? []).length >= 4);
});

test("Dashboard conserva gate de autenticación antes del shell", () => {
  const source = read("app/(dashboard)/layout.tsx");
  assert.match(source, /await requireDashboardUser\(redirect\)/);
  assert.match(source, /<DashboardShell/);
  assert.match(source, /PendingCollectionsBadge/);
});

for (const path of [
  "app/(dashboard)/contratos/[id]/movimientos/page.tsx",
  "app/(dashboard)/liquidaciones/[id]/page.tsx",
]) {
  test(`El detalle ${path} conserva autorización / notFound y hace streaming`, () => {
    const source = read(path);
    assert.match(source, /<Suspense\s+fallback=/);
    assert.match(source, /notFound\(\)/);
    assert.match(source, /async function \w+Contenido/);
    assert.match(source, /TableLoadingSkeleton/);
  });
}

test("Skeletons no consultan datos ni confirman escrituras", () => {
  for (const path of ["components/layout/TableLoadingSkeleton.tsx", "components/layout/AsyncSectionSkeleton.tsx"]) {
    const source = read(path);
    assert.match(source, /role="status"/);
    assert.doesNotMatch(source, /Prisma|fetch\(|mutate\(|router\.push\(/);
  }
});

test("Login no fuerza doble navegación después de autenticar", () => {
  const source = read("lib/supabase/login.ts");
  assert.match(source, /router\.replace\("\/contratos"\)/);
  assert.doesNotMatch(source, /router\.refresh\(\)/);
});

test("Mutaciones siguen delegadas al servidor", () => {
  const routes = read("app/(dashboard)/contratos/page.tsx");
  assert.match(routes, /ContratosWizardData/);
  const modal = read("components/features/pagos/ModalRegistrarPago.tsx");
  assert.match(modal, /form\.handleSubmit|<Form/);
  const manual = read("docs/ui/async-reads.md");
  assert.match(manual, /POST \/ PATCH \/ DELETE/);
});
