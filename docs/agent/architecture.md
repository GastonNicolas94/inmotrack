---
type: Architecture
version: 37d97fb6e
validated: 2026-09-09
update_when: New layers added, folder layout restructured, or the request/data flow changes
scope:
  - app
  - components
  - services
  - lib
  - schemas
  - middleware.ts
  - prisma
---

# Architecture — InmoTrack

## Style

Next.js App Router monolito, con una separación de capas informal pero consistente en todo el repo — no es hexagonal ni tiene lint de arquitectura que la fuerce, es una convención seguida a mano:

| Layer | Path | Regla |
|-------|------|-------|
| Rutas (entrypoint HTTP) | `app/api/v1/**/route.ts` | Solo parsea `req`, valida con zod, llama UN método de un `services/*.ts`, traduce el resultado/error a `NextResponse`. Nunca lógica de negocio ni Prisma directo. |
| Validación | `schemas/*.schema.ts` | Zod schemas, uno por recurso. Los usan tanto las rutas API como los forms de React Hook Form del lado cliente. |
| Servicios (lógica de negocio) | `services/*.ts` | Toda regla de negocio y toda llamada a Prisma vive acá. Exporta un objeto `XxxService` con métodos async. Operaciones multi-tabla van dentro de `prisma.$transaction`. |
| Helpers puros | `lib/*.ts` | Funciones sin I/O (cálculos de fecha, saldos, prelación, punitorios) o wrappers finos sobre un recurso externo (`lib/db.ts`, `lib/auth.ts`). Se testean sin base de datos. |
| UI | `components/**`, `app/(dashboard)/**`, `app/(auth)/**` | Server Components para listar (`TablaXxx.tsx`, fetch directo al service), Client Components (`"use client"`) para todo lo que tiene estado/submit (`ModalXxx.tsx`, `DialogXxx.tsx`, `WizardXxx.tsx`). |

## Folder layout

```
app/
  (auth)/login/                      → Página de login, fuera del dashboard shell
  (dashboard)/                       → Layout con nav lateral (DashboardShell); una carpeta por sección
    contratos/, gastos/, inquilinos/, liquidaciones/, pagos/, propiedades/, propietarios/, transacciones/
    contratos/[id]/movimientos/      → Detalle de movimientos de un contrato puntual
  api/
    auth/[...nextauth]/              → Handler de NextAuth
    v1/                              → API REST — ver contracts.md para la lista completa de rutas
      contratos/, gastos/, inquilinos/, liquidaciones/, pagos/, propiedades/, propietarios/, transacciones/, usuarios/
      cron/                          → Endpoints invocados por Vercel Cron (auth propia, no de sesión — ver traps.md)
  layout.tsx                        → Root layout — ÚNICO lugar donde se monta <Toaster /> (ver traps.md)
  globals.css                        → Tokens del sistema de diseño (--primary, --radius, colores de estado) — ver AGENTS.md del repo

components/
  ui/                                → Primitivos shadcn ("base-nova") — sin lógica de dominio
  layout/                            → PageHeader, DashboardNav, DashboardShell, TableCard — patrones transversales
  features/<dominio>/                → Un dominio por carpeta (contratos, gastos, inquilinos, liquidaciones, pagos, propiedades, propietarios, transacciones)
  features/shared/                   → Compartido entre 2+ dominios (BadgeEstadoPeriodo, PeriodoResumenRow, FiltroRangoFecha, EstadoAsyncModal)

services/                            → Un archivo por agregado de negocio (ver overview.md → Capability map)
lib/                                 → fecha.ts, saldos.ts, prelacion.ts, punitorios.ts, masking.ts, serialize.ts,
                                        estado-cobranza.ts, confeccion-contrato.ts, idempotency.ts, cron-auth.ts, db.ts, auth.ts, errors.ts, api-error-handler.ts
schemas/                             → Un *.schema.ts por recurso (zod)
tests/
  lib/, services/, db/, helpers/     → node:test — ver runbook.md
prisma/
  schema.prisma                      → Modelo de datos completo (fuente de verdad)
  migrations/                        → Migraciones aplicadas a mano (nunca `prisma migrate dev` — ver runbook.md)
  seed.ts                            → Datos de demo
middleware.ts                        → Auth de sesión + control de acceso por rol, corre en TODAS las rutas salvo /login, /api/auth, /api/v1/cron/*
auth.config.ts / lib/auth.ts         → Split Edge/Node de NextAuth — ver traps.md
```

## Request / data flow

```
Request del browser
         ↓
middleware.ts (Edge runtime)
  — sin sesión → 401/redirect a /login
  — ruta en SOLO_ADMIN (method-aware) y rol ≠ ADMIN → 403
  — rol AUDITOR y método ≠ GET → 403
         ↓
app/api/v1/**/route.ts
  — parsea body/params, valida con schemas/*.schema.ts (zod)
         ↓
services/*.ts
  — lógica de negocio; para operaciones multi-tabla, todo dentro de prisma.$transaction
  — locks pesimistas explícitos (`SELECT ... FOR UPDATE` / `FOR UPDATE SKIP LOCKED`) donde hay
    concurrencia real (pagos, liquidaciones, cierre de períodos, punitorios) — Prisma no da
    locking optimista/pesimista de forma nativa acá, se hace con $queryRawUnsafe
         ↓
Prisma Client (adapter-pg) → PostgreSQL
```

Para las páginas del dashboard (no-API), el flujo es más corto: el Server Component (`TablaXxx.tsx`) llama al `service` directamente (sin pasar por HTTP), y los componentes cliente (`ModalXxx.tsx`) hacen `fetch()` a las mismas rutas `/api/v1/*` que usaría un cliente externo.

## Outbox pattern (cierre de períodos)

`services/cierre-periodos.service.ts` es el único lugar del repo con un patrón outbox real:

1. `encolarContratosVencidos()` (cron mensual) encuentra contratos con un período `ABIERTO` vencido y los encola en `outbox_cierre_periodo` (`PENDIENTE`) — o los pasa directo a `VENCIDO` si `fecha_fin` ya pasó.
2. `procesarUnaFilaDeCola()` (cron frecuente) reclama UNA fila con `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING`, la procesa (avanza el período, generando el `Cargo ALQUILER` del mes siguiente), y la marca `COMPLETADO`. Reintenta hasta 3 veces antes de marcarla `ERROR`.

No hay un worker/cola real — el "consumidor" es el propio cron de Vercel llamando al endpoint repetidamente.

## Autenticación — por qué está partida en dos archivos

`auth.config.ts` (sin imports de Node — usable en Edge) define los callbacks JWT/session (qué va en el token). `lib/auth.ts` (Node completo — bcrypt, Prisma) agrega el provider `Credentials` real. `middleware.ts` importa `auth.config.ts` porque corre en el Edge runtime; las rutas API y Server Components importan `lib/auth.ts`. No fusionar los dos — romper el import de Node en `middleware.ts` tira el build entero.

## Low-signal / generated areas

| Path | Nature | Note |
|------|--------|------|
| `.superpowers/sdd/` | Notas de trabajo del flujo superpowers | Autoexcluido por su propio `.gitignore` (`*`) — nunca se commitea |
| `.superpowers/*.md` | Reportes de tareas de subagentes | Historial de construcción, no documentación de producto |
| `prisma/migrations/` | SQL generado por `prisma migrate diff` + ediciones manuales | No editar una migración ya aplicada — ver runbook.md |
| `components/ui/` | Componentes shadcn generados por el CLI | Ajustar tema/variantes ahí está bien; no meter lógica de dominio |
