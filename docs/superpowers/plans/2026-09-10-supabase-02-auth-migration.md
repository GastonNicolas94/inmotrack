# Supabase Auth Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace NextAuth credentials with Supabase Auth while preserving the current domain user IDs, role matrix, server-side authorization, and admin-only user provisioning.

**Architecture:** Supabase Auth owns credentials and sessions; `public.usuarios` owns current authorization state linked by `auth_user_id`. A Next.js 16 proxy refreshes cookies, while every protected server entry point resolves a fresh domain profile before authorizing sensitive work.

**Tech Stack:** Next.js 16.2.9 App Router, Supabase Auth, `@supabase/ssr`, `@supabase/supabase-js`, Prisma 7.8, Zod 4, `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-10-supabase-platform-design.md`

## Global Constraints

- Complete and verify Plan 01 first.
- Read current Supabase SSR/Auth docs and `node_modules/next/dist/docs/` before implementing `proxy.ts`.
- Disable public signup; only ADMIN may invite users.
- Never authorize from `user_metadata`, request bodies, or an unverified `getSession()` result.
- Resolve `rol` and `puede_aprobar_liquidaciones` from `public.usuarios` on the server.
- Keep `SUPABASE_SECRET_KEY` server-only and never prefix it with `NEXT_PUBLIC_`.
- Preserve the exact existing ADMIN/EMPLEADO/AUDITOR behavior and cron bypass.
- Commit steps require explicit user authorization.

---

### Task 1: Add typed Supabase clients and environment validation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `lib/supabase/env.ts`
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/admin.ts`
- Create: `tests/lib/supabase-env.test.ts`

**Interfaces:**
- Produces: `createBrowserSupabaseClient()`, `createServerSupabaseClient()`, `createAdminSupabaseClient()`.
- Consumers: login, proxy, auth context, seed, bootstrap and Realtime.

- [ ] **Step 1: Install exact resolved Auth dependencies**

Run:

```bash
npm install --save-exact @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Write environment validation tests**

Create `tests/lib/supabase-env.test.ts` asserting that public URL, publishable key and server secret each fail with the variable name when absent, and that a complete explicit env object passes.

```ts
assert.deepEqual(readSupabasePublicEnv(validEnv), {
  url: "http://127.0.0.1:54321",
  publishableKey: "local-publishable-key",
});
assert.equal(readSupabaseSecret(validEnv), "local-secret-key");
```

- [ ] **Step 3: Run the test and verify red**

```bash
node --import tsx --test tests/lib/supabase-env.test.ts
```

Expected: FAIL because `lib/supabase/env.ts` is missing.

- [ ] **Step 4: Implement explicit environment readers**

Export:

```ts
export function readSupabasePublicEnv(env = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL es obligatoria.");
  if (!publishableKey) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY es obligatoria.");
  return { url, publishableKey };
}

export function readSupabaseSecret(env = process.env) {
  const value = env.SUPABASE_SECRET_KEY?.trim();
  if (!value) throw new Error("SUPABASE_SECRET_KEY es obligatoria.");
  return value;
}
```

- [ ] **Step 5: Create the three clients**

Use `createBrowserClient` in `client.ts`, `createServerClient` plus awaited `cookies()` in `server.ts`, and `createClient` from `@supabase/supabase-js` in `admin.ts` with:

```ts
auth: { autoRefreshToken: false, persistSession: false }
```

The admin client must import `server-only` before reading the secret.

- [ ] **Step 6: Verify and commit if authorized**

```bash
node --import tsx --test tests/lib/supabase-env.test.ts
git add package.json package-lock.json lib/supabase tests/lib/supabase-env.test.ts
git commit -m "feat: add Supabase auth clients"
```

---

### Task 2: Link domain users to Supabase identities and rebuild the seed

**Files:**
- Modify: `prisma/schema.prisma`
- Create via CLI: one `supabase/migrations/*_supabase_auth_profiles.sql`
- Modify: `prisma/seed.ts`
- Create: `scripts/bootstrap-admin.ts`
- Modify: `package.json`
- Test: `tests/db/constraints.test.ts`

**Interfaces:**
- Produces: required `Usuario.auth_user_id: UUID`, local Auth identities, script `bootstrap:admin`.
- Consumers: auth context and invitations.

- [ ] **Step 1: Write the expected user-shape assertion**

Add a DB test that creates an Auth identity through the local Admin API, creates `Usuario` with its UUID, and asserts duplicate `auth_user_id` is rejected.

- [ ] **Step 2: Create the migration through the CLI**

```bash
npx supabase migration new supabase_auth_profiles
```

Put this SQL in the generated file:

```sql
TRUNCATE TABLE public.usuarios CASCADE;
ALTER TABLE public.usuarios DROP COLUMN password_hash;
ALTER TABLE public.usuarios ADD COLUMN auth_user_id uuid NOT NULL;
CREATE UNIQUE INDEX usuarios_auth_user_id_key ON public.usuarios(auth_user_id);
```

Update Prisma `Usuario`:

```prisma
auth_user_id String @unique @db.Uuid
```

and remove `password_hash`.

- [ ] **Step 3: Rebuild the local seed around Auth Admin**

For each demo identity, call:

```ts
const { data, error } = await admin.auth.admin.createUser({
  email,
  password: "admin123",
  email_confirm: true,
});
if (error) throw error;
```

Then create `Usuario` with `auth_user_id: data.user.id`. Delete existing local Auth users at the beginning only when the database URL passes `assertLocalTestDatabase`.

- [ ] **Step 4: Implement first-admin bootstrap**

`scripts/bootstrap-admin.ts` must require `BOOTSTRAP_ADMIN_EMAIL`, call `admin.auth.admin.inviteUserByEmail`, create the ADMIN profile, compensate with `deleteUser` if Prisma fails, and refuse local/demo password behavior in production.

Add:

```json
"bootstrap:admin": "tsx scripts/bootstrap-admin.ts"
```

- [ ] **Step 5: Reset, seed and verify**

```bash
npm run db:reset:local
npm run seed
node --import tsx --test --test-concurrency=1 tests/db/constraints.test.ts
```

Expected: Auth identities and profiles are created; uniqueness and ledger constraints PASS.

- [ ] **Step 6: Commit if authorized**

```bash
git add prisma/schema.prisma prisma/seed.ts scripts/bootstrap-admin.ts package.json supabase/migrations tests/db/constraints.test.ts
git commit -m "feat: link users to Supabase Auth"
```

---

### Task 3: Replace session handling in login, dashboard and proxy

**Files:**
- Create: `lib/auth-context.ts`
- Create: `lib/http-error.ts`
- Modify: `lib/api-error-handler.ts`
- Create: `lib/supabase/proxy.ts`
- Create: `proxy.ts`
- Modify: `app/(auth)/login/page.tsx`
- Modify: `app/(dashboard)/layout.tsx`
- Modify: `components/layout/DashboardShell.tsx`
- Create: `tests/lib/auth-context.test.ts`

**Interfaces:**
- Produces: `AuthenticatedUser`, `getAuthenticatedUser()`, `requireAuthenticatedUser()`, `requireAdmin()`.
- Consumers: Server Components and all API authorization in Task 4.

- [ ] **Step 1: Write authorization matrix tests**

Use dependency injection for identity/profile lookup and cover missing identity, missing profile, ADMIN, EMPLEADO, AUDITOR and delegated approval. Assert the returned shape:

```ts
type AuthenticatedUser = {
  id: number;
  authUserId: string;
  email: string;
  rol: "ADMIN" | "EMPLEADO" | "AUDITOR";
  puedeAprobarLiquidaciones: boolean;
  idPropietario: number | null;
};
```

- [ ] **Step 2: Implement the server-only auth context**

`getAuthenticatedUser()` validates identity with the server Supabase client, reads `sub`, then runs:

```ts
prisma.usuario.findUnique({ where: { auth_user_id: claims.sub } })
```

Create the HTTP-aware error used by Auth:

```ts
export class HttpError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "HttpError";
  }
}
```

Teach `handleServiceError` to map `HttpError` before its generic `Error` branch. Return `null` when identity or profile is missing. `requireAuthenticatedUser()` throws `new HttpError("UNAUTHORIZED", "No autenticado.", 401)`. `requireAdmin()` throws `new HttpError("FORBIDDEN", "Acceso denegado.", 403)` unless `rol === "ADMIN"`.

- [ ] **Step 3: Implement cookie refresh in Next.js 16 proxy**

Adapt the current official Supabase SSR proxy example. Preserve the existing static-asset exclusions and `/api/v1/cron/*` bypass. Proxy performs coarse identity redirect/401 only; route-level authorization in Task 4 remains the authoritative role check.

- [ ] **Step 4: Replace login and logout**

In the login submit handler call:

```ts
const supabase = createBrowserSupabaseClient();
const { error } = await supabase.auth.signInWithPassword({ email, password });
```

On success `router.replace("/contratos")` and `router.refresh()`. In the dashboard server action call `createServerSupabaseClient().auth.signOut()` and redirect to `/login`.

- [ ] **Step 5: Replace dashboard identity lookup**

`app/(dashboard)/layout.tsx` calls `requireAuthenticatedUser()` and passes `email` and `rol` to `DashboardShell` without `any` casts.

- [ ] **Step 6: Verify focused tests and manual flow**

```bash
node --import tsx --test tests/lib/auth-context.test.ts
npx next build
npm run dev
```

Manually verify login, refresh, logout and expired-cookie redirect using the local Supabase instance.

- [ ] **Step 7: Commit if authorized**

```bash
git add lib/auth-context.ts lib/http-error.ts lib/api-error-handler.ts lib/supabase/proxy.ts proxy.ts app/'(auth)'/login/page.tsx app/'(dashboard)'/layout.tsx components/layout/DashboardShell.tsx tests/lib/auth-context.test.ts
git commit -m "feat: migrate sessions to Supabase Auth"
```

---

### Task 4: Move role enforcement to protected server entry points

**Files:**
- Modify: every non-cron route under `app/api/v1/**/route.ts`
- Modify: `components/features/contratos/TablaContratos.tsx`
- Modify: `components/features/gastos/TablaGastos.tsx`
- Modify: `components/features/liquidaciones/TablaLiquidaciones.tsx`
- Modify: `components/features/transacciones/TablaLibroDiario.tsx`
- Create: `tests/lib/api-authorization.test.ts`

**Interfaces:**
- Consumes: auth helpers from Task 3.
- Produces: no route that trusts proxy-only role data.

- [ ] **Step 1: Add policy helpers and tests**

Implement and test:

```ts
export function assertCanWrite(user: AuthenticatedUser) {
  if (user.rol === "AUDITOR") throw new HttpError("FORBIDDEN", "Rol sin permisos de escritura.", 403);
}

export function assertCanApproveLiquidation(user: AuthenticatedUser) {
  if (user.rol !== "ADMIN" && !user.puedeAprobarLiquidaciones) {
    throw new HttpError("FORBIDDEN", "No puede aprobar liquidaciones.", 403);
  }
}
```

- [ ] **Step 2: Guard every GET**

At the top of every non-cron GET handler call `await requireAuthenticatedUser()`. This includes contratos, cargos pendientes, períodos, inquilinos, saldos, propiedades, propietarios, resumen, adelantos, pagos, gastos, liquidaciones, transacciones and usuarios.

- [ ] **Step 3: Guard every general write**

For POST/PATCH handlers that allow ADMIN and EMPLEADO, resolve the user and call `assertCanWrite(user)`. Pass `user.id` as `id_usuario_creador`; never accept that field from JSON.

- [ ] **Step 4: Guard sensitive writes**

Use `requireAdmin()` for confirmar pago, contra-asiento and POST adelantos. Use `assertCanApproveLiquidation` for aprobar. Use `requireAdmin()` for PATCH usuarios.

- [ ] **Step 5: Replace Server Component auth imports**

Replace every `@/lib/auth` import found by:

```bash
rg -l 'next-auth|@/lib/auth|auth\(\)|signIn|signOut' app components lib
```

The expected domain components are the four table files listed above plus dashboard layout and login already changed in Task 3.

- [ ] **Step 6: Verify the role matrix**

Run focused authorization tests, then manually call one GET and one POST as each role. Expected: unauthenticated 401, AUDITOR GET 200/write 403, EMPLEADO general write allowed, ADMIN sensitive writes allowed.

- [ ] **Step 7: Commit if authorized**

```bash
git add app/api/v1 components/features tests/lib/api-authorization.test.ts lib/auth-context.ts
git commit -m "fix: enforce Supabase roles at server entry points"
```

---

### Task 5: Add admin invitation flow and remove NextAuth

**Files:**
- Create: `schemas/usuario.schema.ts`
- Create: `services/usuarios.service.ts`
- Modify: `app/api/v1/usuarios/route.ts`
- Create: `tests/services/usuarios.service.test.ts`
- Delete: `auth.config.ts`
- Delete: `lib/auth.ts`
- Delete: `app/api/auth/[...nextauth]/route.ts`
- Delete: `middleware.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `docs/agent/overview.md`
- Modify: `docs/agent/architecture.md`
- Modify: `docs/agent/contracts.md`
- Modify: `docs/agent/runbook.md`
- Modify: `docs/agent/traps.md`

**Interfaces:**
- Produces: `UsuariosService.invitar(input, actor)`, `POST /api/v1/usuarios`.
- Consumes: Admin client, Prisma and auth policies.

- [ ] **Step 1: Write service tests first**

Cover successful invite, non-admin rejection, duplicate email, invalid role, Prisma failure compensation through `admin.auth.admin.deleteUser`, and list masking expectations.

- [ ] **Step 2: Define the validated input**

```ts
export const invitarUsuarioSchema = z.object({
  email: z.string().email(),
  rol: z.enum(["ADMIN", "EMPLEADO", "AUDITOR"]),
  puede_aprobar_liquidaciones: z.boolean().default(false),
  id_propietario: z.number().int().positive().nullable().default(null),
});
```

Add a refinement: only EMPLEADO may receive `puede_aprobar_liquidaciones: true`.

- [ ] **Step 3: Implement invitation with compensation**

Call `inviteUserByEmail(email, { redirectTo: `${APP_URL}/auth/confirm` })`, create the Prisma profile, and on Prisma failure call `deleteUser(authUser.id)` before rethrowing. Map duplicate-email responses to 409.

- [ ] **Step 4: Add POST usuarios and preserve PATCH**

Both POST and PATCH call `requireAdmin()`. POST returns 201 without returning secrets or Auth internals. PATCH preserves the existing delegation rule.

- [ ] **Step 5: Remove the old stack**

```bash
npm uninstall next-auth bcryptjs @types/bcryptjs
rg 'next-auth|bcrypt|NEXTAUTH_' --glob '!docs/superpowers/**'
```

Expected: the search has no application-code matches. Delete the four obsolete files listed above only after `proxy.ts` is active.

- [ ] **Step 6: Full Auth verification**

```bash
npm run db:reset:local
npm run seed
npm run lint
npx next build
npm test
```

Expected: all PASS against local Supabase.

- [ ] **Step 7: Update agent docs and commit if authorized**

Document Auth ownership, proxy behavior, invitation route, new env vars and removal of password hashes. Set touched guide frontmatter to the current short HEAD and `validated: 2026-09-10` immediately before commit.

```bash
git add -A
git commit -m "feat: complete Supabase Auth migration"
```

- [ ] **Step 8: Phase gate**

Stop and obtain human verification of ADMIN, EMPLEADO and AUDITOR flows before starting Plan 03.
