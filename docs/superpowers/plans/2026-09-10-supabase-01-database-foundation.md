# Supabase Database Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move InmoTrack development and production persistence to Supabase PostgreSQL while keeping Prisma as the sole application ORM and making destructive tests incapable of reaching a remote database.

**Architecture:** Supabase CLI owns the disposable local stack and `supabase/migrations` owns executable SQL history. Prisma remains the application schema and query layer; Vercel uses Supavisor transaction pooling while schema operations use a session/direct connection.

**Tech Stack:** Next.js 16.2.9, Node.js 20+, Prisma 7.8, `@prisma/adapter-pg`, PostgreSQL 17, Supabase CLI, `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-10-supabase-platform-design.md`

## Global Constraints

- Read `AGENTS.md` and all five `docs/agent/*` guides before editing.
- Before changing Next.js conventions, read the matching guide in `node_modules/next/dist/docs/`.
- Do not use `prisma migrate dev`.
- Do not create or reuse a remote Supabase project in this phase; this phase must pass entirely against Supabase local.
- Keep Prisma and `services/` as the only application path to financial tables.
- Preserve the PostgreSQL trigger that rejects `UPDATE` and `DELETE` on `transacciones`.
- Never run a DB-backed test until the local-only guard introduced in Task 2 passes.
- Commit steps require the user's explicit authorization under this repository's `AGENTS.md`.

---

### Task 1: Install and initialize the local Supabase toolchain

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `supabase/config.toml` through the Supabase CLI
- Modify: `.gitignore`

**Interfaces:**
- Consumes: existing npm project and Prisma schema.
- Produces: scripts `supabase:start`, `supabase:stop`, `supabase:status`, and `db:reset:local`.

- [ ] **Step 1: Inspect the current CLI interface instead of assuming flags**

Run:

```bash
npx supabase --help
npx supabase init --help
npx supabase db reset --help
```

Expected: every command exits 0 and documents the flags used below.

- [ ] **Step 2: Install and pin the CLI**

Run:

```bash
npm install --save-dev --save-exact supabase
```

Expected: `package.json` contains an exact `supabase` version and `package-lock.json` changes.

- [ ] **Step 3: Initialize the local stack**

Run:

```bash
npx supabase init
```

Edit only generated values needed for this project and set:

```toml
project_id = "inmotrack"

[db]
port = 54322
major_version = 17
```

- [ ] **Step 4: Add stable npm scripts**

Add to `scripts` in `package.json`:

```json
"supabase:start": "supabase start",
"supabase:stop": "supabase stop",
"supabase:status": "supabase status",
"db:reset:local": "supabase db reset"
```

- [ ] **Step 5: Start the stack and capture local connection values**

Run:

```bash
npm run supabase:start
npm run supabase:status
```

Expected: PostgreSQL listens on `127.0.0.1:54322`; Studio, Auth and Realtime report healthy.

- [ ] **Step 6: Commit if authorized**

```bash
git add package.json package-lock.json supabase/config.toml .gitignore
git commit -m "chore: initialize local Supabase stack"
```

---

### Task 2: Fail closed on missing or remote database URLs

**Files:**
- Create: `lib/database-url.ts`
- Create: `tests/lib/database-url.test.ts`
- Modify: `lib/db.ts`
- Modify: `prisma.config.ts`
- Modify: `tests/helpers/db.ts`

**Interfaces:**
- Produces: `requireDatabaseUrl(env?)`, `requireDirectUrl(env?)`, and `assertLocalTestDatabase(url)`.
- Consumers: Prisma runtime, Prisma config, seed scripts, and destructive test helpers.

- [ ] **Step 1: Write URL guard tests**

Create `tests/lib/database-url.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  assertLocalTestDatabase,
  requireDatabaseUrl,
  requireDirectUrl,
} from "@/lib/database-url";

test("requireDatabaseUrl rejects a missing value", () => {
  assert.throws(() => requireDatabaseUrl({}), /DATABASE_URL/);
});

test("requireDirectUrl rejects a missing value", () => {
  assert.throws(() => requireDirectUrl({}), /DIRECT_URL/);
});

test("destructive tests accept Supabase local", () => {
  assert.doesNotThrow(() =>
    assertLocalTestDatabase("postgresql://postgres:postgres@127.0.0.1:54322/postgres")
  );
});

test("destructive tests reject Supabase remote and generic localhost", () => {
  assert.throws(() =>
    assertLocalTestDatabase("postgresql://postgres.ref:secret@sa-east-1.pooler.supabase.com:6543/postgres")
  );
  assert.throws(() =>
    assertLocalTestDatabase("postgresql://postgres@localhost:5432/inmotrack")
  );
});
```

- [ ] **Step 2: Run the test and verify red**

Run:

```bash
node --import tsx --test tests/lib/database-url.test.ts
```

Expected: FAIL because `lib/database-url.ts` does not exist.

- [ ] **Step 3: Implement the exact guards**

Create `lib/database-url.ts`:

```ts
type DatabaseEnv = Record<string, string | undefined>;

function requireValue(name: "DATABASE_URL" | "DIRECT_URL", env: DatabaseEnv) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} es obligatoria.`);
  return value;
}

export function requireDatabaseUrl(env: DatabaseEnv = process.env) {
  return requireValue("DATABASE_URL", env);
}

export function requireDirectUrl(env: DatabaseEnv = process.env) {
  return requireValue("DIRECT_URL", env);
}

export function assertLocalTestDatabase(url: string) {
  const parsed = new URL(url);
  const localHost = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  if (!localHost || parsed.port !== "54322" || parsed.pathname !== "/postgres") {
    throw new Error("Los tests destructivos solo pueden usar Supabase local en 127.0.0.1:54322/postgres.");
  }
}
```

- [ ] **Step 4: Wire the runtime and migration URLs**

In `lib/db.ts`, replace the fallback with:

```ts
import { requireDatabaseUrl } from "@/lib/database-url";

const pool = new Pool({
  connectionString: requireDatabaseUrl(),
  max: Number(process.env.DATABASE_POOL_MAX ?? "5"),
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
});

const log: ("query" | "error" | "warn")[] =
  process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"];
```

Construct `PrismaClient` with `{ adapter, log }`. In `prisma.config.ts`, add `import "dotenv/config"` and use `env("DIRECT_URL")` from `prisma/config` for `datasource.url`.

- [ ] **Step 5: Protect the destructive helper before the first SQL statement**

At the start of `cleanDatabase()` add:

```ts
assertLocalTestDatabase(requireDatabaseUrl());
```

Import both helpers from `@/lib/database-url`.

- [ ] **Step 6: Verify green without touching a database**

Run:

```bash
node --import tsx --test tests/lib/database-url.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 7: Commit if authorized**

```bash
git add lib/database-url.ts lib/db.ts prisma.config.ts tests/lib/database-url.test.ts tests/helpers/db.ts
git commit -m "fix: guard database connections and destructive tests"
```

---

### Task 3: Establish one Supabase SQL migration history

**Files:**
- Create via CLI: one `supabase/migrations/*_initial_inmotrack.sql`
- Preserve from existing history: the immutable ledger trigger SQL
- Modify: `prisma/schema.prisma` only if `prisma validate` reveals drift

**Interfaces:**
- Produces: a fresh database matching `prisma/schema.prisma` and rejecting ledger mutations.
- Consumers: every service and DB-backed test.

- [ ] **Step 1: Create the migration with the CLI and record its actual path**

Run:

```bash
npx supabase migration new initial_inmotrack
find supabase/migrations -maxdepth 1 -name '*_initial_inmotrack.sql' -print
```

Expected: exactly one path is printed. Store it in a task-local shell variable named `INMOTRACK_BASELINE_MIGRATION`.

- [ ] **Step 2: Generate the Prisma baseline mechanically**

Run:

```bash
INMOTRACK_BASELINE_MIGRATION=$(find supabase/migrations -maxdepth 1 -name '*_initial_inmotrack.sql' -print -quit)
npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script > "$INMOTRACK_BASELINE_MIGRATION"
```

Expected: the file contains all models and enums from `prisma/schema.prisma`.

- [ ] **Step 3: Append the immutable ledger protection**

Add after table creation:

```sql
CREATE OR REPLACE FUNCTION public.rechazar_mutacion_transacciones()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'La tabla transacciones es inmutable: no se permite UPDATE ni DELETE. Use un CONTRA_ASIENTO.';
END;
$$;

CREATE TRIGGER transacciones_inmutables
BEFORE UPDATE OR DELETE ON public.transacciones
FOR EACH ROW EXECUTE FUNCTION public.rechazar_mutacion_transacciones();
```

- [ ] **Step 4: Reset local and validate schema parity**

Create `.env.local` entries using values from `supabase status`:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
DATABASE_POOL_MAX=5
```

Run:

```bash
npm run db:reset:local
npx prisma validate
npx prisma generate
```

Expected: reset, validation and generation exit 0.

- [ ] **Step 5: Prove ledger immutability against local Supabase**

Run the existing constraint test only after confirming `DATABASE_URL` points to port 54322:

```bash
node --import tsx --test --test-concurrency=1 tests/db/constraints.test.ts
```

Expected: the `transacciones` update/delete assertions PASS.

- [ ] **Step 6: Commit if authorized**

```bash
git add supabase/migrations prisma/schema.prisma
git commit -m "chore: baseline schema for Supabase"
```

---

### Task 4: Validate the application on Supabase local and document the new runbook

**Files:**
- Modify: `README.md`
- Modify: `docs/agent/architecture.md`
- Modify: `docs/agent/runbook.md`
- Modify: `docs/agent/traps.md`

**Interfaces:**
- Produces: a reproducible local workflow and documentation consumed by later plans.
- Consumes: Tasks 1–3.

- [ ] **Step 1: Reset and seed the local database**

Run:

```bash
npm run db:reset:local
npm run seed
```

Expected: the existing demo dataset is created on port 54322.

- [ ] **Step 2: Run the complete current verification sequence**

Run:

```bash
npm run lint
npx next build
npm test
```

Expected: all commands PASS. If a failure predates this phase, record the exact command and output; do not weaken the DB guard.

- [ ] **Step 3: Update maintained agent documentation**

Document these exact commands:

```bash
npm run supabase:start
npm run db:reset:local
npm run seed
npm run dev
```

Replace the old migration instructions with `supabase migration new`, Prisma diff, `supabase db reset`, advisors, and remote push. Add a trap stating that destructive tests accept only `127.0.0.1:54322/postgres`. Update each touched guide's `version` to the current short HEAD and `validated` to `2026-09-10` immediately before its commit.

- [ ] **Step 4: Commit if authorized**

```bash
git add README.md docs/agent/architecture.md docs/agent/runbook.md docs/agent/traps.md
git commit -m "docs: document Supabase local database workflow"
```

- [ ] **Step 5: Phase gate**

Stop here and verify manually that the existing NextAuth login and one payment flow work against Supabase local. Begin Plan 02 only after this gate passes.

