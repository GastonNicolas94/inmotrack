# Dashboard operativo y financiero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/` redirect with a server-first dashboard that gives the inmobiliaria an actionable operational view and a financially correct period view.

**Architecture:** Parse a validated filter state from URL search parameters, authenticate at the existing dashboard boundary, and load typed dashboard DTOs through a dedicated Prisma service. Render KPI cards, alerts, accessible SVG/CSS charts and fallback states as server components; keep the accounting source of truth in the existing domain tables and do not add Realtime or a reporting database.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 7 with PostgreSQL/Supabase, Zod 4, existing shadcn/Base UI primitives, Node test runner and c8.

**Spec:** `docs/superpowers/specs/2026-09-12-dashboard-design.md`

## Global Constraints

- The dashboard has exactly two tabs: Operativo and Financiero.
- The first version is a server-side snapshot; it does not use Supabase Realtime, polling, client-side Prisma or a separate analytics layer.
- Financial calculations use signed `Transaccion` rows and include contra-asientos without double-counting gross collection and commission.
- Third-party cash is never mixed into the inmobiliaria's operating result.
- The MVP does not display net result by property because the current schema cannot attribute every transaction explicitly to a property.
- Use `hoyEnArgentina`, `mesEnArgentina` and UTC-safe handling for PostgreSQL `@db.Date` fields.
- Do not add a chart dependency; use accessible SVG/CSS primitives.
- Do not change payment, punitorios, credit, liquidation or accounting semantics.
- Do not add speculative indexes; only measure and propose them separately if the implementation exposes a query problem.
- New or semantically modified logic must reach 100% statements, branches, functions and lines in the configured coverage scope.
- Every task ends with a focused test run and a commit; the implementation is delivered through stacked PRs with a final `epic/dashboard -> develop` PR.
- Before creating implementation branches, ensure the unrelated Vercel region PR is merged or rebase the dashboard stack so the final dashboard diff does not accidentally carry unrelated region work.

---

## File Map

The implementation is intentionally split by responsibility:

| File | Responsibility |
| --- | --- |
| `lib/dashboard/types.ts` | Public filter, DTO, metric, alert and chart types shared by service and UI. |
| `lib/dashboard/filters.ts` | Search-param parsing, safe defaults, month boundaries and URL serialization. |
| `lib/dashboard/metrics.ts` | Pure money/sign/grouping calculations and chart view-model helpers. |
| `services/dashboard.service.ts` | Server-only Prisma queries for operational and financial dashboard data. |
| `components/features/dashboard/DashboardMetricCard.tsx` | Shared KPI card presentation. |
| `components/features/dashboard/DashboardFilters.tsx` | GET form for period, property and portfolio filters. |
| `components/features/dashboard/DashboardTabs.tsx` | URL-preserving tab navigation. |
| `components/features/dashboard/OperationalDashboard.tsx` | Operational cards, alerts and quick actions. |
| `components/features/dashboard/FinancialDashboard.tsx` | Financial cards, charts and tabular chart data. |
| `components/features/dashboard/DashboardCharts.tsx` | Accessible SVG/CSS chart primitives. |
| `components/features/dashboard/DashboardStates.tsx` | Empty, loading and isolated error states. |
| `app/(dashboard)/page.tsx` | Authenticated dashboard route and server composition. |
| `app/(dashboard)/loading.tsx` | Dashboard-specific route skeleton. |
| `components/layout/DashboardNav.tsx` | Navigation entry and active state for `/`. |
| `tests/lib/dashboard-filters.test.ts` | Parser and date-boundary tests. |
| `tests/lib/dashboard-metrics.test.ts` | Pure financial, operational and chart-model tests. |
| `tests/services/dashboard.service.test.ts` | Local database integration tests for DTOs and filters. |
| `package.json` | Coverage command includes all new logic. |

---

### Task 1: Define dashboard contracts, filters and pure calculations

**Files:**
- Create: `lib/dashboard/types.ts`
- Create: `lib/dashboard/filters.ts`
- Create: `lib/dashboard/metrics.ts`
- Create: `tests/lib/dashboard-filters.test.ts`
- Create: `tests/lib/dashboard-metrics.test.ts`

**Interfaces:**
- Produces `DashboardFilters`, `OperationalDashboardData`, `FinancialDashboardData`, `DashboardAlert`, `DashboardPropertyOption`, `DashboardTab` and `DashboardPortfolio` for all later tasks.
- Produces `parseDashboardFilters(input, now)`, `serializeDashboardFilters(filters, overrides)`, `getArgentinaMonthRange(periodo)`, `calculateSignedFinancials(rows)`, `calculatePendingAmount(monto, aplicaciones)` and chart view-model helpers.
- Consumes existing `hoyEnArgentina`, `mesEnArgentina`, `calcularPendiente` and Prisma Decimal string values only through typed adapters; the UI never receives Decimal instances.

- [ ] **Step 1: Write failing filter tests.**

  Add tests for the exact defaults and URL contract:

  ```ts
  test("uses safe defaults for an empty query", () => {
    const filters = parseDashboardFilters({}, new Date("2026-09-12T15:00:00Z"));

    assert.deepEqual(filters, {
      tab: "operativo",
      periodo: "2026-09",
      propiedadId: null,
      cartera: "todas",
      periodoInicio: new Date("2026-09-01T03:00:00.000Z"),
      periodoFinExclusivo: new Date("2026-10-01T03:00:00.000Z"),
    });
  });

  test("rejects invalid tab, month, property and portfolio values", () => {
    const filters = parseDashboardFilters({
      tab: "otro",
      periodo: "2026-99",
      propiedad: "-4",
      cartera: "desconocida",
    }, new Date("2026-09-12T15:00:00Z"));

    assert.equal(filters.tab, "operativo");
    assert.equal(filters.periodo, "2026-09");
    assert.equal(filters.propiedadId, null);
    assert.equal(filters.cartera, "todas");
  });

  test("serializes tab changes without dropping shared filters", () => {
    const query = serializeDashboardFilters({
      tab: "operativo",
      periodo: "2026-09",
      propiedadId: 7,
      cartera: "terceros",
      periodoInicio: new Date("2026-09-01T03:00:00.000Z"),
      periodoFinExclusivo: new Date("2026-10-01T03:00:00.000Z"),
    }, { tab: "financiero" });

    assert.equal(query, "tab=financiero&periodo=2026-09&propiedad=7&cartera=terceros");
  });
  ```

- [ ] **Step 2: Run the focused filter tests and verify they fail for missing modules.**

  Run:

  ```bash
  node --import tsx --test tests/lib/dashboard-filters.test.ts
  ```

  Expected: FAIL because the parser and filter types do not exist yet.

- [ ] **Step 3: Implement the filter types and parser.**

  Use this public shape and keep all date handling in one module:

  ```ts
  export type DashboardTab = "operativo" | "financiero";
  export type DashboardPortfolio = "todas" | "propias" | "terceros";

  export type DashboardFilters = {
    tab: DashboardTab;
    periodo: string;
    propiedadId: number | null;
    cartera: DashboardPortfolio;
    periodoInicio: Date;
    periodoFinExclusivo: Date;
  };

  export type DashboardSearchParams = Record<
    string,
    string | string[] | undefined
  >;

  export function parseDashboardFilters(
    input: DashboardSearchParams | URLSearchParams,
    now: Date = new Date(),
  ): DashboardFilters;

  export function serializeDashboardFilters(
    filters: DashboardFilters,
    overrides?: Partial<Pick<DashboardFilters, "tab" | "periodo" | "propiedadId" | "cartera">>,
  ): string;

  export function getArgentinaMonthRange(periodo: string): {
    inicio: Date;
    finExclusivo: Date;
  };
  ```

  Parse only the first value of repeated parameters, accept `propiedad=todos`, require a positive integer property ID, validate `YYYY-MM` with a real month, and calculate Argentina month boundaries without using process-local getters.

- [ ] **Step 4: Run the focused filter tests and verify they pass.**

  Run:

  ```bash
  node --import tsx --test tests/lib/dashboard-filters.test.ts
  ```

  Expected: all parser, default, invalid-input and serialization tests PASS.

- [ ] **Step 5: Write failing pure metric tests.**

  Cover signed transaction classification, contra-asientos, pending cargo balances and chart series:

  ```ts
  test("does not double-count a gross collection and its commission", () => {
    const totals = calculateSignedFinancials([
      { tipo: "INGRESO_COBRO", caja: "TERCEROS", monto: "100000.00", originType: null },
      { tipo: "INGRESO_COMISION", caja: "OPERATIVA", monto: "10000.00", originType: "INGRESO_COBRO" },
    ]);

    assert.deepEqual(totals, {
      cobrado: "100000.00",
      ingresosInmobiliaria: "10000.00",
      gastosOperativos: "0.00",
      resultadoOperativo: "10000.00",
    });
  });

  test("a contra-asiento reverses the original category", () => {
    const totals = calculateSignedFinancials([
      { tipo: "INGRESO_COMISION", caja: "OPERATIVA", monto: "10000.00", originType: null },
      { tipo: "CONTRA_ASIENTO", caja: "OPERATIVA", monto: "-10000.00", originType: "INGRESO_COMISION" },
    ]);

    assert.equal(totals.ingresosInmobiliaria, "0.00");
  });

  test("pending cargo balance includes negative applications", () => {
    assert.equal(calculatePendingAmount("100000.00", ["-20000.00", "50000.00"]), "70000.00");
  });
  ```

- [ ] **Step 6: Implement metric and chart helpers with string money values.**

  Keep Decimal arithmetic at the database boundary or use a decimal-safe helper; never use binary floating-point arithmetic for accounting totals. Define the transaction input as:

  ```ts
  export type DashboardTransactionRow = {
    tipo: string;
    caja: "TERCEROS" | "OPERATIVA";
    monto: string;
    originType: string | null;
  };
  ```

  Define `FinancialTotals` with string-valued amounts and a `ChartPoint` with a stable `label`, `valueA`, `valueB` shape. Return zero-valued structures for empty input.

- [ ] **Step 7: Run the focused metric tests.**

  Run:

  ```bash
  node --import tsx --test tests/lib/dashboard-metrics.test.ts
  ```

  Expected: all financial classification, sign, pending-balance, grouping and empty-input tests PASS.

- [ ] **Step 8: Commit the contract layer.**

  ```bash
  git add lib/dashboard/types.ts lib/dashboard/filters.ts lib/dashboard/metrics.ts tests/lib/dashboard-filters.test.ts tests/lib/dashboard-metrics.test.ts
  git commit -m "feat: define dashboard contracts and calculations"
  ```

### Task 2: Add the server-side dashboard aggregation service

**Files:**
- Create: `services/dashboard.service.ts`
- Create: `tests/services/dashboard.service.test.ts`
- Read: `prisma/schema.prisma`, `services/contratos.service.ts`, `services/gastos.service.ts`, `services/liquidaciones.service.ts`, `services/pagos.service.ts`, `services/transacciones.service.ts`

**Interfaces:**
- Consumes `DashboardFilters` and the pure helpers from Task 1.
- Produces `createDashboardService(dependencies)`, `DashboardService.getOperationalData(filters)`, `DashboardService.getFinancialData(filters)` and `DashboardService.listPropertyOptions()`.
- Returns only `OperationalDashboardData`, `FinancialDashboardData` and `DashboardPropertyOption` DTOs from `lib/dashboard/types.ts`.

- [ ] **Step 1: Define the service dependency boundary.**

  Add an injectable runtime so database behavior can be tested without replacing production imports:

  ```ts
  import type { PrismaClient } from "@prisma/client";

  export type DashboardServiceDependencies = {
    prisma: PrismaClient;
    now: () => Date;
  };

  export type DashboardService = {
    getOperationalData(filters: DashboardFilters): Promise<OperationalDashboardData>;
    getFinancialData(filters: DashboardFilters): Promise<FinancialDashboardData>;
    listPropertyOptions(): Promise<DashboardPropertyOption[]>;
  };

  export function createDashboardService(
    dependencies: DashboardServiceDependencies,
  ): DashboardService;
  ```

  Export the production singleton as `createDashboardService({ prisma, now: () => new Date() })` and keep the service module server-only.

- [ ] **Step 2: Write the operational integration fixtures and assertions.**

  Use the existing local database helper and create fixtures for:

  - one property marked `es_propia = true`;
  - one third-party property;
  - active, moroso, por-vencer and terminal contracts;
  - an overdue rental cargo with a partial application;
  - a pending owner expense and a pending agency expense;
  - pending and approved liquidations;
  - one property with no contract to prove unattributed transactions are not invented.

  Assert the exact DTO values, alert limits and property/portfolio filters. Do not assert implementation details such as query count until a measured regression requires it.

- [ ] **Step 3: Run the service test to verify it fails before the service exists.**

  Run:

  ```bash
  INMOTRACK_ALLOW_DESTRUCTIVE_TESTS=1 node --import tsx --conditions=react-server --test tests/services/dashboard.service.test.ts
  ```

  Expected: FAIL because `services/dashboard.service.ts` and the DTO methods do not exist yet.

- [ ] **Step 4: Implement property options and common predicates.**

  `listPropertyOptions()` must return `{ id, direccion, esPropia }` ordered by address. Build one internal property predicate from `propiedadId` and `cartera` and reuse it for contract, cargo, gasto, application and transaction queries. A portfolio filter must use the explicit `Propiedad.es_propia` value.

- [ ] **Step 5: Implement operational KPI queries without loading the portfolio into memory.**

  Use parallel aggregate queries for contract counts, pending expenses and pending liquidations. For debt, use a parameterized aggregation that computes `Cargo.monto - SUM(AplicacionPago.monto_aplicado)` grouped by cargo and filters positive balances after the due date. The query must include applications generated by contra-asientos.

  The service must return this shape:

  ```ts
  type OperationalDashboardData = {
    generatedAt: Date;
    metrics: {
      contratosVigentes: number;
      contratosPorVencer: number;
      cuotasVencidas: number;
      montoVencido: string;
      gastosPendientes: { cantidad: number; monto: string };
      liquidacionesPendientes: { cantidad: number; monto: string };
    };
    alerts: DashboardAlert[];
  };
  ```

- [ ] **Step 6: Implement operational alert queries with explicit limits and links.**

  Return at most five rows per alert category. Use this deterministic order: debt by oldest due date, expiring contracts by nearest `fecha_fin`, pending expenses by oldest `creado_en`, and pending liquidations with `PENDIENTE` before `APROBADA` then oldest `fecha_corrida`. Include enough identity data for the UI (contract ID, tenant name, property address, amount and target route). Use `/contratos/[id]/movimientos` for contract debt/expiry details and the existing `/gastos` and `/liquidaciones` routes for their respective alerts.

- [ ] **Step 7: Implement financial aggregation from signed transactions.**

  Query `Transaccion.fecha_transaccion` in the selected month and six-month chart range. Classify rows by `tipo`, `caja_destino` and the original transaction type for contra-asientos. Include `INGRESO_CONFECCION_CONTRATO` in operating income. Keep `EGRESO_LIQUIDACION`, `EGRESO_TERCEROS` and `EGRESO_ADELANTO` outside the operating result.

  The financial DTO must include:

  ```ts
  type FinancialDashboardData = {
    generatedAt: Date;
    periodo: string;
    metrics: {
      cobrado: string;
      ingresosInmobiliaria: string;
      gastosOperativosPagados: string;
      resultadoOperativo: string;
      pendienteLiquidar: string;
      deudaVencida: string;
    };
    monthlyCashFlow: Array<{ periodo: string; ingresos: string; egresos: string }>;
    collectionsByPortfolio: Array<{ cartera: "propias" | "terceros"; monto: string }>;
    collectionsByProperty: Array<{ propiedadId: number; direccion: string; monto: string }>;
    expensesByCategory: Array<{ categoria: string; monto: string }>;
    unattributedExcluded: boolean;
  };
  ```

- [ ] **Step 8: Implement explicit attribution behavior for property filters.**

  When a property or portfolio filter is present, include only rows whose relation to `Propiedad` is explicit. Set `unattributedExcluded = true` whenever a filtered query had to exclude owner-level or property-only movements that cannot be linked through the current schema. Do not guess a property from a proprietor or a date.

- [ ] **Step 9: Run the service integration tests and inspect the DTOs.**

  Run:

  ```bash
  INMOTRACK_ALLOW_DESTRUCTIVE_TESTS=1 node --import tsx --conditions=react-server --test tests/services/dashboard.service.test.ts
  ```

  Expected: PASS for global, property-filtered and portfolio-filtered operational/financial datasets, including contra-asientos and empty data.

- [ ] **Step 10: Commit the aggregation service.**

  ```bash
  git add services/dashboard.service.ts tests/services/dashboard.service.test.ts
  git commit -m "feat: add dashboard aggregation service"
  ```

### Task 3: Build the Operational tab

**Files:**
- Create: `components/features/dashboard/DashboardMetricCard.tsx`
- Create: `components/features/dashboard/DashboardStates.tsx`
- Create: `components/features/dashboard/DashboardQuickActions.tsx`
- Create: `components/features/dashboard/OperationalDashboard.tsx`
- Create: `components/features/dashboard/OperationalAlerts.tsx`
- Read: `components/ui/card.tsx`, `components/ui/badge.tsx`, `components/ui/table.tsx`, `components/layout/PageHeader.tsx`, `components/layout/TableCard.tsx`

**Interfaces:**
- Consumes `OperationalDashboardData` and `DashboardFilters` from Tasks 1–2.
- Produces server components that render the six operational KPIs, limited alert lists, quick-action links and empty/error states.

- [ ] **Step 1: Define the shared metric-card and state components.**

  Use existing `Card` primitives and keep values as already formatted strings from a dedicated formatter. The metric card must expose an accessible label and optional secondary text:

  ```tsx
  export function DashboardMetricCard({
    label,
    value,
    detail,
    tone,
  }: {
    label: string;
    value: string;
    detail?: string;
    tone?: "default" | "warning" | "danger" | "success";
  }) { /* ... */ }
  ```

  `DashboardStates` must include a visible empty message, a `role="status"` loading state and an error fallback that does not throw into the whole page.

- [ ] **Step 2: Write the operational component data-shape test.**

  Add a pure test for the view-model/formatting functions that proves zero counts, zero money, a warning amount and a danger amount render deterministic labels. Keep React markup out of Node-only tests; the server component consumes the tested DTO directly.

- [ ] **Step 3: Implement the KPI grid.**

  Render the six metrics in a responsive grid. Use `aria-label`/visible labels that match the specification exactly: “Contratos vigentes”, “Contratos por vencer”, “Cuotas vencidas”, “Monto vencido”, “Gastos pendientes” and “Liquidaciones pendientes”. Do not hide a zero behind an empty string.

- [ ] **Step 4: Implement alert lists with safe links.**

  Render each category with a heading, count/amount and up to five rows. Use `Link` for navigation, escape all database text through React rendering, and show an explicit empty state for a category with no alerts. Keep route construction in a small pure helper covered by the Task 1 test group.

- [ ] **Step 5: Implement quick actions using existing destinations.**

  Link to `/contratos`, `/pagos`, `/gastos` and `/liquidaciones` using existing button variants. Do not add new write endpoints or bypass existing role checks.

- [ ] **Step 6: Run lint and type/build checks for the component layer.**

  Run:

  ```bash
  npm run lint
  npm run build
  ```

  Expected: PASS with no new accessibility, import or TypeScript errors.

- [ ] **Step 7: Commit the Operational tab.**

  ```bash
  git add components/features/dashboard
  git commit -m "feat: add operational dashboard view"
  ```

### Task 4: Build the Financial tab and accessible charts

**Files:**
- Create: `components/features/dashboard/DashboardCharts.tsx`
- Create: `components/features/dashboard/FinancialDashboard.tsx`
- Modify: `lib/dashboard/metrics.ts`
- Modify: `tests/lib/dashboard-metrics.test.ts`

**Interfaces:**
- Consumes `FinancialDashboardData` and shared dashboard components from Tasks 1–3.
- Produces accessible SVG/CSS charts for monthly cash flow, portfolio collections, property collections and registered expenses by category.

- [ ] **Step 1: Extend pure chart-model tests before markup.**

  Test that chart data is normalized to deterministic labels, zero-height bars remain visible with a minimum accessible value, negative operating results are represented as negative values, and an empty series returns an empty-state model rather than invalid SVG coordinates.

- [ ] **Step 2: Implement chart geometry helpers without floating-point accounting.**

  Use string/decimal-safe values for money and convert only normalized display ratios to numbers after calculating the maximum. Expose tested helpers such as:

  ```ts
  export type ChartBar = { label: string; value: string; ratio: number };

  export function buildBars(
    rows: Array<{ label: string; value: string }>,
  ): ChartBar[];
  ```

  Clamp display ratios to `[0, 1]`, handle an all-zero series, and never use the ratio to recalculate a monetary value.

- [ ] **Step 3: Implement accessible SVG/CSS chart primitives.**

  Each chart must include a visible title, a short text summary, stable `role="img"` labeling and a table/list fallback with the same values. Avoid animation that delays the first meaningful paint. Use existing color variables from `app/globals.css`.

- [ ] **Step 4: Implement FinancialDashboard KPI cards and charts.**

  Render the six financial metrics, the six-month income/expense series, own-vs-third-party collections, property collections and agency expense categories. Show the `unattributedExcluded` note when a property/portfolio filter excludes movements without explicit property attribution.

- [ ] **Step 5: Verify financial totals against existing pages.**

  With the integration fixtures from Task 2, compare the displayed DTO values to `/pagos`, `/gastos`, `/liquidaciones` and `/transacciones`. The chart component must not introduce a second calculation path; it renders only the service DTO.

- [ ] **Step 6: Run focused tests and build.**

  ```bash
  node --import tsx --test tests/lib/dashboard-metrics.test.ts
  npm run lint
  npm run build
  ```

  Expected: PASS with no new dependency and no chart accessibility errors reported by lint/type checking.

- [ ] **Step 7: Commit the Financial tab.**

  ```bash
  git add components/features/dashboard/DashboardCharts.tsx components/features/dashboard/FinancialDashboard.tsx lib/dashboard/metrics.ts tests/lib/dashboard-metrics.test.ts
  git commit -m "feat: add financial dashboard view"
  ```

### Task 5: Integrate route, filters, tabs, navigation and loading states

**Files:**
- Create: `components/features/dashboard/DashboardFilters.tsx`
- Create: `components/features/dashboard/DashboardTabs.tsx`
- Modify: `app/(dashboard)/page.tsx`
- Modify: `app/(dashboard)/loading.tsx`
- Modify: `components/layout/DashboardNav.tsx`
- Modify: `components/features/dashboard/DashboardStates.tsx`

**Interfaces:**
- Consumes `parseDashboardFilters`, `serializeDashboardFilters`, `DashboardService`, `OperationalDashboard` and `FinancialDashboard`.
- Produces the authenticated `/` route with URL-driven tabs and filters while preserving the existing dashboard shell and navigation behavior.

- [ ] **Step 1: Write the page contract around Next.js search parameters.**

  The page must accept the App Router promise shape and parse it before querying:

  ```tsx
  type DashboardPageProps = {
    searchParams: Promise<DashboardSearchParams>;
  };

  export default async function DashboardPage({ searchParams }: DashboardPageProps) {
    const filters = parseDashboardFilters(await searchParams);
    // render only the selected tab's server data
  }
  ```

  A direct request to `/` defaults to the current month and the Operativo tab.

- [ ] **Step 2: Implement the GET filter form.**

  Render native accessible `<select>` controls inside `<form method="get">` so changing a filter works without client state. Include hidden `tab`, options from `listPropertyOptions()`, the current month plus the previous 23 months (24 month options total), and the `todas/propias/terceros` portfolio options. Preserve the other query parameters on submit.

- [ ] **Step 3: Implement tab links that preserve filters.**

  `DashboardTabs` must call `serializeDashboardFilters` with only the tab override. Use `Link`, active styling and `aria-current="page"`/equivalent tab semantics. Do not add a custom client-side router or polling loop.

- [ ] **Step 4: Replace the root redirect with the server dashboard.**

  `app/(dashboard)/page.tsx` should:

  1. parse and validate search parameters;
  2. load property options and the selected tab's DTO in parallel where independent;
  3. render `PageHeader`, `DashboardFilters` and `DashboardTabs`;
  4. render only `OperationalDashboard` or `FinancialDashboard` for the selected tab;
  5. wrap data sections in `Suspense` with the dashboard skeleton.

- [ ] **Step 5: Add the Dashboard item to the shell navigation.**

  Add a `LayoutDashboard` item pointing to `/` before the domain modules. Treat `/` as active only when `pathname === "/"`; do not make it active for every route.

- [ ] **Step 6: Replace the generic table skeleton with the dashboard skeleton.**

  Keep the existing `role="status"` and screen-reader text, but show header, filter row, KPI cards and two content blocks so the loading layout matches the final page without adding a client dependency.

- [ ] **Step 7: Add isolated fallbacks for section failures.**

  Catch service errors at the selected section boundary and render a retry/navigation message. Do not expose Prisma errors, connection strings or query text. A financial failure must not be reported as an empty dataset.

- [ ] **Step 8: Run route-level verification.**

  ```bash
  npm run lint
  npm run build
  ```

  Expected: `/` builds as an authenticated dynamic route, existing module routes remain unchanged, and no server/client boundary error is introduced.

- [ ] **Step 9: Commit the shell integration.**

  ```bash
  git add 'app/(dashboard)/page.tsx' 'app/(dashboard)/loading.tsx' components/layout/DashboardNav.tsx components/features/dashboard/DashboardFilters.tsx components/features/dashboard/DashboardTabs.tsx components/features/dashboard/DashboardStates.tsx
  git commit -m "feat: integrate dashboard route and filters"
  ```

### Task 6: Wire coverage, run the full verification suite and document manual checks

**Files:**
- Modify: `package.json`
- Read: `docs/superpowers/specs/2026-09-12-dashboard-design.md`
- Test: all dashboard tests from Tasks 1–2 and existing repository tests

**Interfaces:**
- Consumes all dashboard modules and fixtures from Tasks 1–5.
- Produces a repeatable coverage command that includes the new pure logic and aggregation service.

- [ ] **Step 1: Add dashboard files to the coverage command.**

  Add a dedicated c8 group to `test:coverage` with these includes and tests:

  ```bash
  c8 --100 --reporter=text --reporter=lcov \
    --include=lib/dashboard/filters.ts \
    --include=lib/dashboard/metrics.ts \
    --include=services/dashboard.service.ts \
    node --import tsx --conditions=react-server --test \
    tests/lib/dashboard-filters.test.ts \
    tests/lib/dashboard-metrics.test.ts \
    tests/services/dashboard.service.test.ts
  ```

  Keep visual-only JSX out of the c8 include list unless it contains executable business logic; its data and formatting helpers must already be covered by the pure tests.

- [ ] **Step 2: Run focused dashboard coverage.**

  ```bash
  npm run test:coverage
  ```

  Expected: every c8 group reports 100% statements, branches, functions and lines; failures must be fixed before opening the PR.

- [ ] **Step 3: Run all repository tests and static checks.**

  ```bash
  npm test
  npm run lint
  npm run build
  git diff --check
  ```

  Expected: existing auth, financial, cron and performance tests remain green, the build succeeds, and Git reports no whitespace errors.

- [ ] **Step 4: Prepare the manual Preview checklist.**

  Validate in the deployed Preview (the user performs the browser validation):

  ```text
  /                                  -> dashboard operativo
  /?tab=financiero                   -> dashboard financiero
  /?tab=financiero&periodo=2026-08  -> financial period changes
  /?propiedad=7&cartera=terceros    -> explicit attribution note when needed
  ```

  Compare known amounts with the existing Pagos, Gastos, Liquidaciones and Libro Diario screens. Verify the empty state by selecting a month without data and verify alert links manually.

- [ ] **Step 5: Commit coverage and verification configuration.**

  ```bash
  git add package.json
  git commit -m "test: enforce dashboard coverage"
  ```

### Task 7: Assemble the stacked PRs and final epic PR

**Files:**
- No production files; Git branch and PR metadata only.

**Interfaces:**
- Consumes the commits from Tasks 1–6.
- Produces a clean `epic/dashboard` branch and one final PR into `develop`.

- [ ] **Step 1: Create the epic branch from the current `develop`.**

  Confirm the Vercel region work is already in `develop`; otherwise keep it as the separate PR #10 and do not mix its commit into the dashboard changes. Create `epic/dashboard` from the current `develop` and bring the approved specification commit with it.

- [ ] **Step 2: Apply the implementation tasks as stacked PRs.**

  Use this order and base relationship:

  ```text
  epic/dashboard                         (base: develop)
  ├── dashboard-contracts                 (base: epic/dashboard)
  ├── dashboard-operational-data          (base: epic/dashboard after contracts)
  ├── dashboard-operational-ui            (base: epic/dashboard after operational data)
  ├── dashboard-financial                  (base: epic/dashboard after operational UI)
  └── dashboard-shell-and-verification    (base: epic/dashboard after financial)
  ```

  Each internal PR must contain its focused tests and pass CI before it is merged into the epic branch. Do not ask the user to merge intermediate PRs into `develop`.

- [ ] **Step 3: Review the final epic diff against `develop`.**

  Run:

  ```bash
  git diff --stat develop...epic/dashboard
  git diff --check develop...epic/dashboard
  ```

  Confirm that the diff contains the dashboard, its tests, coverage configuration and the approved spec, with no credentials, generated `.env` files or unrelated Vercel changes.

- [ ] **Step 4: Open the only production-facing PR.**

  Open `epic/dashboard -> develop` with the summary, KPI definitions, known attribution limitation and verification commands. Include the Preview URL for the user's manual validation. Do not merge without the user's approval.
