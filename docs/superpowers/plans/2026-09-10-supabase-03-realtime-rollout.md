# Supabase Realtime and Production Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe real-time view invalidation and persistent internal notifications, then provision and release InmoTrack on a new São Paulo Supabase project without exposing financial tables.

**Architecture:** Financial services atomically append sanitized domain events to `app_events`; authenticated browsers subscribe only to that table and refetch authoritative server-rendered data. `app_event_reads` provides per-user read state, while Supabase RLS and explicit grants keep all business tables private.

**Tech Stack:** Supabase Realtime/Postgres Changes, PostgreSQL RLS, `@supabase/supabase-js`, Next.js 16 App Router, Prisma 7.8, Vercel Functions and Cron.

**Spec:** `docs/superpowers/specs/2026-09-10-supabase-platform-design.md`

## Global Constraints

- Complete Plans 01 and 02 first.
- Realtime is an invalidation/notification channel, never the accounting source of truth.
- Do not expose financial tables to `anon` or `authenticated`.
- Event messages contain no amount, email, DNI/CUIT, CBU, phone or arbitrary payload.
- Only payments, contra-asientos and liquidation lifecycle changes create persistent notifications.
- The application must remain usable when Realtime is disconnected.
- Require 100% line, function and branch coverage for new or semantically modified event, notification and Realtime logic.
- Vercel Cron stays unchanged except for environment and region configuration.
- Creating a paid Supabase project or changing Vercel production requires explicit user confirmation at execution time.
- Commit steps require explicit user authorization.

---

### Task 1: Add event and read models with least-privilege RLS

**Files:**
- Modify: `prisma/schema.prisma`
- Create via CLI: one `supabase/migrations/*_realtime_app_events.sql`
- Create: `lib/app-events.ts`
- Create: `tests/lib/app-events.test.ts`
- Modify: `tests/helpers/db.ts`

**Interfaces:**
- Produces: `AppEventType`, `APP_EVENT_DEFINITIONS`, Prisma models `AppEvent` and `AppEventRead`.
- Consumers: event service, notification APIs and client provider.

- [ ] **Step 1: Define and test the event catalog**

Create a closed catalog with safe static messages and refresh targets:

```ts
export const APP_EVENT_DEFINITIONS = {
  PAGO_REGISTRADO: { entity: "pago", route: "/pagos", persistent: true, message: "Se registró un pago.", refreshPrefixes: ["/pagos", "/contratos"] },
  GASTO_CREADO: { entity: "gasto", route: "/gastos", persistent: false, message: "Se cargó un gasto.", refreshPrefixes: ["/gastos", "/contratos"] },
  GASTO_PAGADO: { entity: "gasto", route: "/gastos", persistent: false, message: "Se marcó un gasto como pagado.", refreshPrefixes: ["/gastos"] },
  CONTRATO_ACTIVADO: { entity: "contrato", route: "/contratos", persistent: false, message: "Se activó un contrato.", refreshPrefixes: ["/contratos"] },
  LIQUIDACION_GENERADA: { entity: "liquidacion", route: "/liquidaciones", persistent: true, message: "Se generó una liquidación.", refreshPrefixes: ["/liquidaciones", "/propietarios"] },
  LIQUIDACION_APROBADA: { entity: "liquidacion", route: "/liquidaciones", persistent: true, message: "Se aprobó una liquidación.", refreshPrefixes: ["/liquidaciones", "/propietarios"] },
  LIQUIDACION_PAGADA: { entity: "liquidacion", route: "/liquidaciones", persistent: true, message: "Se confirmó el pago de una liquidación.", refreshPrefixes: ["/liquidaciones", "/propietarios"] },
  CONTRA_ASIENTO_CREADO: { entity: "transaccion", route: "/transacciones", persistent: true, message: "Se creó un contra-asiento.", refreshPrefixes: ["/transacciones", "/pagos", "/contratos"] },
} as const;
```

Tests assert that definitions use static messages, omit banned field names, have at least one refresh prefix, and every route/prefix starts with `/`.

- [ ] **Step 2: Add Prisma models**

Add these models and the reciprocal relations on `Usuario`:

```prisma
model AppEvent {
  id                    BigInt         @id @default(autoincrement())
  type                  String         @db.VarChar(50)
  entity                String         @db.VarChar(30)
  entity_id             Int?
  message               String         @db.VarChar(240)
  route                 String?        @db.VarChar(200)
  persistent            Boolean        @default(false)
  created_by_user_id    Int?
  created_by_user       Usuario?       @relation(fields: [created_by_user_id], references: [id], onDelete: SetNull)
  created_at            DateTime       @default(now())
  expires_at            DateTime?
  reads                 AppEventRead[]

  @@index([persistent, created_at])
  @@map("app_events")
}

model AppEventRead {
  id_app_event BigInt
  app_event    AppEvent @relation(fields: [id_app_event], references: [id], onDelete: Cascade)
  id_usuario   Int
  usuario      Usuario  @relation(fields: [id_usuario], references: [id], onDelete: Cascade)
  read_at      DateTime @default(now())

  @@id([id_app_event, id_usuario])
  @@index([id_usuario, read_at])
  @@map("app_event_reads")
}
```

Add `app_events AppEvent[]` and `app_event_reads AppEventRead[]` to `Usuario`.

- [ ] **Step 3: Create SQL migration through the CLI**

```bash
npx supabase migration new realtime_app_events
```

Generate Prisma SQL for the two tables, then append explicit grants, RLS and publication changes. Revoke all business table privileges from `anon` and `authenticated`. Grant `authenticated` SELECT on `app_events` and `app_event_reads`; server writes continue through Prisma.

- [ ] **Step 4: Add secure internal-user policy support**

Append this policy support, adjusting only publication idempotency if the generated local Supabase version requires it:

```sql
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.current_usuario_id()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.id
  FROM public.usuarios AS u
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION private.current_usuario_id() FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_usuario_id() TO authenticated;

ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_event_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_events_internal_select
ON public.app_events FOR SELECT
TO authenticated
USING (private.current_usuario_id() IS NOT NULL);

CREATE POLICY app_event_reads_own_select
ON public.app_event_reads FOR SELECT
TO authenticated
USING (id_usuario = private.current_usuario_id());

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
GRANT SELECT ON public.app_events, public.app_event_reads TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_events;
```

Do not grant browser INSERT, UPDATE or DELETE on either table. Do not add `app_event_reads` to Realtime; its UI state is reconciled from the API response.

- [ ] **Step 5: Reset and verify RLS**

Use Supabase local publishable and anon contexts to prove anon receives zero access, a mapped authenticated user can read events, and one user cannot read another user's read rows.

- [ ] **Step 6: Commit if authorized**

```bash
git add prisma/schema.prisma supabase/migrations lib/app-events.ts tests/lib/app-events.test.ts tests/helpers/db.ts
git commit -m "feat: add secure realtime event schema"
```

---

### Task 2: Emit events atomically from financial services

**Files:**
- Create: `services/eventos.service.ts`
- Create: `tests/services/eventos.service.test.ts`
- Modify: `services/pagos.service.ts`
- Modify: `services/gastos.service.ts`
- Modify: `services/contratos.service.ts`
- Modify: `services/liquidaciones.service.ts`
- Modify: `services/transacciones.service.ts`
- Modify: corresponding service tests.

**Interfaces:**
- Produces: `EventosService.emitir(tx, input)`.
- Consumes: `Prisma.TransactionClient`, event catalog and authenticated domain user ID.

- [ ] **Step 1: Write atomicity and sanitization tests**

Cover one persistent and one transient event, invalid type rejection, rollback with the parent transaction, and absence of financial/PII fields.

- [ ] **Step 2: Implement the single event writer**

```ts
type EmitirEventoInput = {
  type: AppEventType;
  entityId: number | null;
  createdByUserId: number | null;
};

async function emitir(
  tx: Prisma.TransactionClient,
  input: EmitirEventoInput
) {
  const definition = APP_EVENT_DEFINITIONS[input.type];
  return tx.appEvent.create({
    data: {
      type: input.type,
      entity: definition.entity,
      entity_id: input.entityId,
      message: definition.message,
      route: definition.route,
      persistent: definition.persistent,
      created_by_user_id: input.createdByUserId,
    },
  });
}
```

- [ ] **Step 3: Add events at successful transaction boundaries**

Emit exactly once after the relevant records have been created/updated but before the surrounding Prisma transaction returns. Use the eight event types in the catalog. Add `id_usuario_creador` where a current service signature lacks it, sourcing it only from the authenticated route.

- [ ] **Step 4: Prove rollback and idempotency behavior**

Run service tests sequentially. A duplicate idempotent payment must not create a second `PAGO_REGISTRADO`; a failed payment/liquidation must create no event.

- [ ] **Step 5: Commit if authorized**

```bash
git add services tests/services
git commit -m "feat: emit transactional application events"
```

---

### Task 3: Build notification APIs and read state

**Files:**
- Create: `services/notificaciones.service.ts`
- Create: `schemas/notificacion.schema.ts`
- Create: `app/api/v1/notificaciones/route.ts`
- Create: `app/api/v1/notificaciones/leer/route.ts`
- Create: `tests/services/notificaciones.service.test.ts`

**Interfaces:**
- Produces: `listar(userId, cursor?, limit?)`, `marcarLeidas(userId, eventIds)`, GET `/api/v1/notificaciones`, POST `/api/v1/notificaciones/leer`.
- Consumers: NotificationPanel and RealtimeProvider recovery.

- [ ] **Step 1: Write pagination and ownership tests**

Cover newest-first cursor pagination, unread count, only persistent events, marking selected IDs, marking all visible IDs, idempotent repeated marking, and cross-user isolation.

- [ ] **Step 2: Define request validation**

```ts
export const marcarLeidasSchema = z.object({
  event_ids: z.array(z.coerce.bigint()).min(1).max(100),
});
```

Serialize bigint IDs as decimal strings at the HTTP boundary.

- [ ] **Step 3: Implement service queries**

Return `{ items, nextCursor, unreadCount }`. Use `createMany({ skipDuplicates: true })` for reads. Never mutate `app_events` when a user reads one.

- [ ] **Step 4: Add authenticated routes**

Both routes use `requireAuthenticatedUser()`. GET accepts `cursor` and `limit` with a maximum of 50. POST always writes read rows for `user.id`, ignoring any client-supplied user identifier.

- [ ] **Step 5: Verify and commit if authorized**

```bash
node --import tsx --test --test-concurrency=1 tests/services/notificaciones.service.test.ts
git add services/notificaciones.service.ts schemas/notificacion.schema.ts app/api/v1/notificaciones tests/services/notificaciones.service.test.ts
git commit -m "feat: add persistent notification API"
```

---

### Task 4: Add one dashboard Realtime subscription and notification UI

**Files:**
- Create: `components/features/notificaciones/RealtimeProvider.tsx`
- Create: `components/features/notificaciones/NotificationBell.tsx`
- Create: `components/features/notificaciones/NotificationPanel.tsx`
- Create: `components/features/notificaciones/realtime-routing.ts`
- Create: `tests/lib/realtime-routing.test.ts`
- Modify: `components/layout/DashboardShell.tsx`

**Interfaces:**
- Produces: one authenticated channel per tab, debounced `router.refresh()`, notification count and panel.
- Consumes: browser Supabase client and notification APIs.

- [ ] **Step 1: Test route matching and deduplication as pure functions**

```ts
assert.equal(shouldRefresh("/pagos", event("PAGO_REGISTRADO", "1")), true);
assert.equal(shouldRefresh("/contratos", event("PAGO_REGISTRADO", "1")), false);
assert.equal(seenEventIds(["1", "1", "2"]), 2);
```

Also test that multiple matching events inside 500 ms request one refresh.

- [ ] **Step 2: Implement the provider lifecycle**

Subscribe to `postgres_changes`, schema `public`, table `app_events`, event `INSERT`. On payload: validate against the closed event catalog, ignore seen IDs, show a toast, update persistent count and schedule refresh. Remove the channel on cleanup and logout.

- [ ] **Step 3: Recover after reconnect**

Fetch GET `/api/v1/notificaciones` once on initial mount. When channel status returns to `SUBSCRIBED` after an interruption, fetch it again and reconcile unseen persistent IDs and unread count. Display a muted disconnected indicator without blocking forms.

- [ ] **Step 4: Build the panel using existing design primitives**

Use existing semantic status tokens, `rounded-xl` overlays and shared buttons. The panel includes unread count, newest-first items, internal links, mark-read actions, loading/error/empty states and no raw Tailwind business-state colors.

- [ ] **Step 5: Mount once in DashboardShell**

Wrap dashboard content with `RealtimeProvider` and render one `NotificationBell` in the shell header/sidebar. Do not mount providers per page.

- [ ] **Step 6: Verify UI and commit if authorized**

```bash
node --import tsx --test tests/lib/realtime-routing.test.ts
npm run lint
npx next build
git add components/features/notificaciones components/layout/DashboardShell.tsx tests/lib/realtime-routing.test.ts
git commit -m "feat: add realtime dashboard notifications"
```

Use two browser sessions against Supabase local: register a payment in one and verify toast, count and `/pagos` refresh in the other.

---

### Task 5: Provision São Paulo production and perform the release gate

**Files:**
- Modify: `vercel.json`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: all five `docs/agent/*.md` guides as applicable
- Modify: `docs/superpowers/plans/TODO.md` only to remove superseded Supabase follow-ups or add concrete newly discovered traps

**Interfaces:**
- Produces: new Supabase production project, Vercel environment, documented operating procedure.
- Consumes: all prior tasks and explicit user approval for cost/external writes.

- [ ] **Step 1: Recheck current platform documentation**

Review the current Supabase changelog, Auth SSR, API keys, Prisma, regions, Realtime and RLS guides. Run `npx supabase --version` and relevant `--help` commands. Stop if current behavior contradicts the spec and update the design before provisioning.

- [ ] **Step 2: Obtain cost confirmation and create the project**

Use the Supabase cost tool first, present the amount to the user, obtain confirmation, then create a new project named `inmotrack` in `sa-east-1`. Do not reuse `supabase-management-real-state`.

- [ ] **Step 3: Configure production safely**

Disable public signup, set Site URL and allowed redirects, configure production SMTP, obtain publishable/secret keys, and configure Realtime publication only for `app_events`. Create a dedicated `prisma` database role following the current Supabase Prisma guide, with a generated password and only the schema/table/routine/sequence privileges required by this app. Keep financial tables ungranted to `anon` and `authenticated`.

- [ ] **Step 4: Apply schema and run advisors**

Use the direct/session connection for migrations. Apply the versioned Supabase migrations, then run Security and Performance Advisors. Resolve every security finding affecting exposed tables, RLS, functions or leaked privileges before proceeding.

- [ ] **Step 5: Configure Vercel**

Set `DATABASE_URL`, `DIRECT_URL`, `DATABASE_POOL_MAX=5`, public Supabase URL/key, server secret and `CRON_SECRET`. Remove `NEXTAUTH_SECRET`. Configure Node functions in São Paulo `gru1` using the current supported `vercel.json` syntax verified from Vercel docs.

- [ ] **Step 6: Bootstrap and smoke test**

Run `npm run bootstrap:admin` once with the chosen admin email. Deploy preview without production DB credentials for build/assets validation, then promote with production variables. Verify login, invitation, one controlled write, Realtime delivery, mark-read, role restrictions and a manually authenticated cron request.

- [ ] **Step 7: Run the final verification sequence**

Extend `test:coverage` to include `lib/app-events.ts`, `services/eventos.service.ts`, `services/notificaciones.service.ts`, `components/features/notificaciones/realtime-routing.ts` and every additional module containing new non-presentational logic. Keep presentational JSX, generated Prisma code, SQL migrations and declarative config explicitly excluded; their integration/E2E checks remain mandatory.

```bash
npm run lint
npx next build
npm test
npm run test:coverage
```

Expected: coverage is 100% for lines, functions and branches in the declared Supabase implementation scope. Also verify the remote `transacciones` trigger by attempting a rollbacked update inside a transaction and confirming the expected exception. Confirm no secret appears in client bundles or HTTP payloads.

- [ ] **Step 8: Update maintained documentation**

Document project region, environment names without values, migration/deploy procedure, Auth ownership, Realtime recovery, RLS surface and incident checks. Update guide frontmatter with current short HEAD and `validated: 2026-09-10`.

- [ ] **Step 9: Commit if authorized**

```bash
git add vercel.json .env.example README.md docs/agent docs/superpowers/plans/TODO.md
git commit -m "docs: finalize Supabase production runbook"
```

- [ ] **Step 10: Final human acceptance**

Do not declare rollout complete until the user confirms the three roles, notifications and one financial flow behave correctly in production.
