# InmoTrack Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incorporar observabilidad HTTP, aplicación, frontend y base de datos con correlación end-to-end, bajo ruido y sanitización por defecto.

**Architecture:** `proxy.ts` conserva auth/sesión. La observabilidad HTTP vive en `withObservability()` alrededor de Route Handlers. Vercel almacena runtime telemetry; Sentry agrupa excepciones; PostgreSQL/Supabase proveen query/health metrics.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vercel, Sentry, Prisma 7, PostgreSQL/Supabase, node:test.

**Spec:** `docs/superpowers/specs/2026-09-15-observability-design.md`

## Global Constraints

- No capturar request/response completo desde `proxy.ts`.
- No loguear Authorization, cookies, passwords, tokens, API keys, binarios ni multipart.
- Request/response loggable: máximo 20 KB.
- 4xx => warn; 5xx => error; 2xx/3xx => métricas salvo evento de negocio o slow request.
- Slow request inicial: 2000 ms. Slow query inicial: 1000 ms.
- Mantener `handleServiceError` como traductor de errores de dominio/Prisma.
- Actualizar `docs/agent/*` en los PRs que cambien arquitectura/request flow/runbook.
- No cambiar reglas de negocio.

---

### Task 1 / PR 1: Observability foundation

**Branch:** `feat/observability-foundation`

**Files:**
- Create: `lib/observability/logger.ts`
- Create: `lib/observability/sanitizer.ts`
- Create: `lib/observability/request-id.ts`
- Create: `lib/observability/types.ts`
- Create: `tests/lib/observability-sanitizer.test.ts`
- Create: `tests/lib/observability-request-id.test.ts`
- Modify: `app/layout.tsx`
- Modify: `package.json`, `package-lock.json`
- Modify: `docs/agent/architecture.md`, `docs/agent/runbook.md`

**Produces:** `logger`, `sanitizeForLogging`, `getOrCreateRequestId`; Web Analytics y Speed Insights montados en root layout.

- [ ] Agregar tests de sanitización: redacción recursiva, headers sensibles, truncado 20 KB, multipart/binario omitido.
- [ ] Ejecutar tests y verificar RED.
- [ ] Implementar sanitizer mínimo y verificar GREEN.
- [ ] Agregar tests de request id: reutiliza header válido y genera ID cuando falta.
- [ ] Implementar request id y logger JSON server-side.
- [ ] Instalar `@vercel/analytics` y `@vercel/speed-insights`, montar componentes en `app/layout.tsx`.
- [ ] Ejecutar tests puros, lint de archivos tocados y `npm run build`.
- [ ] Actualizar docs/agent.

### Task 2 / PR 2: HTTP middleware + Sentry

**Branch:** `feat/observability-http-sentry`, base `feat/observability-foundation`.

**Files:**
- Create: `lib/observability/with-observability.ts`
- Create: `lib/observability/sentry.ts`
- Create: `tests/lib/with-observability.test.ts`
- Modify: `app/api/v1/**/route.ts`
- Modify: `lib/api-error-handler.ts` only if needed to preserve original error for telemetry without changing HTTP mapping.
- Modify: `package.json`, `package-lock.json`, `next.config.ts`
- Modify: Sentry-generated Next.js instrumentation/config files as required by current SDK.
- Modify: `docs/agent/architecture.md`, `docs/agent/runbook.md`, `docs/agent/contracts.md` only if headers/observable contract need documentation.

**Produces:** `withObservability(handler)` with request/response/error correlation and optional Sentry integration.

- [ ] Tests: 2xx no full log, 4xx warn with sanitized payloads, 5xx error + exception hook, slow 2xx warn, response includes `x-request-id`.
- [ ] Verify RED.
- [ ] Implement wrapper preserving `NextResponse` status/body semantics.
- [ ] Integrate Sentry Next.js conditionally; absence of DSN must not break dev/build.
- [ ] Add tags/context: request_id, route, environment, user id when available; avoid PII.
- [ ] Wrap API v1 Route Handlers without moving business logic into routes.
- [ ] Verify focused tests + build.

### Task 3 / PR 3: Domain observability + log cleanup

**Branch:** `feat/observability-domain-events`, base `feat/observability-http-sentry`.

**Files:**
- Create: `lib/observability/events.ts`
- Modify: `services/contratos.service.ts`
- Modify: `services/pagos.service.ts`
- Modify: `services/liquidaciones.service.ts`
- Modify: `services/gastos.service.ts`
- Modify other files only where low-value `console.*` is replaced/removed.
- Add focused tests for emitted domain events without asserting transport internals.

**Produces:** stable event catalog and high-signal domain logging.

- [ ] Define typed event names from spec.
- [ ] Add RED tests around critical success/failure transitions.
- [ ] Instrument created/activated/cancelled/failed where semantically available.
- [ ] Remove narrative/debug logging in touched flows; retain dependency anomalies.
- [ ] Verify no business behavior changes.

### Task 4 / PR 4: Database + performance + alerting baseline

**Branch:** `feat/observability-database-performance`, base `feat/observability-domain-events`.

**Files:**
- Create: `lib/observability/database.ts`
- Create: `scripts/observability-db-report.ts` or equivalent read-only diagnostic entrypoint.
- Add tests for query normalization/threshold classification helpers.
- Modify `lib/db.ts` only using Prisma/adapter-pg hooks supported by the installed versions.
- Modify `docs/agent/runbook.md` with Supabase `pg_stat_statements` queries and operational dashboard instructions.
- No schema migration unless current Supabase project actually requires enabling an extension through migration.

**Produces:** slow-query events, repeatable DB diagnostics, documented dashboards/alert thresholds.

- [ ] Verify current Supabase/Postgres `pg_stat_statements` availability before schema changes.
- [ ] Add helpers/tests for slow query >1000 ms.
- [ ] Instrument supported DB timing path without logging bind values/secrets.
- [ ] Add read-only report queries for mean/max/total time, calls, rows, active connections, utilization proxy, cache hit ratio and long-running queries.
- [ ] Document API p50/p95/p99 and alert thresholds; configure only where current plan/tooling supports it without requiring Pro-only Vercel features.
- [ ] Run build and non-destructive focused tests; do not run destructive DB suite unless explicitly safe/local.

## Stack / merge strategy

`develop` <- PR1 <- PR2 <- PR3 <- PR4.

Review each PR independently. When all are approved, merge in order; retarget the next PR to `develop` after its parent merges. A final aggregate PR is unnecessary if stacked PRs are merged in order; if desired for one-click review, create a temporary integration branch from PR4 and compare it to `develop` without duplicating commits.

## Definition of Done

- API requests have correlation ID.
- 4xx/5xx structured logs contain sanitized request/response.
- Slow successful requests are visible.
- Sentry errors correlate to request/release/environment when configured.
- Domain events exist for contracts/payments/settlements/expenses.
- Web Analytics and Speed Insights emit telemetry.
- DB slow queries and top query statistics are diagnosable.
- Build passes; focused tests pass; docs/agent reflects new request flow/runbook.
