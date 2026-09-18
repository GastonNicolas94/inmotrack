---
type: Architecture
version: 5b8553b
validated: 2026-09-18
update_when: New layers added, folder layout restructured, or the request/data flow changes
scope:
  - app
  - components
  - services
  - lib
  - schemas
  - proxy.ts
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
| Helpers puros | `lib/*.ts` | Funciones sin I/O (cálculos de fecha, saldos, prelación, punitorios, calendario de ajustes) o wrappers finos sobre un recurso externo (`lib/db.ts`, `lib/auth-context.ts`, `lib/supabase/*`). Se testean sin base de datos. |
| UI | `components/**`, `app/(dashboard)/**`, `app/(auth)/**` | Server Components para listar (`TablaXxx.tsx`, fetch directo al service), Client Components (`"use client"`) para todo lo que tiene estado/submit (`ModalXxx.tsx`, `DialogXxx.tsx`, `WizardXxx.tsx`). |

## Folder layout

```text
app/
  (auth)/login/                      → Página de login, fuera del dashboard shell
  (dashboard)/                       → Layout con nav lateral (DashboardShell)
    contratos/, gastos/, inquilinos/, liquidaciones/, pagos/, propiedades/, propietarios/, transacciones/
    contratos/[id]/movimientos/      → Detalle de movimientos de un contrato puntual
    liquidaciones/[id]/              → Detalle auditable de una liquidación puntual
    dev/reloj/                       → Reloj global de pruebas (solo ADMIN, no producción)
  api/
    auth/confirm/                    → Valida la invitación y establece cookies
    v1/                              → API REST — ver contracts.md
      cron/                          → Endpoints de Vercel Cron con `CRON_SECRET`
    queues/cierre-periodos/          → Subscriber de Vercel Queue
  layout.tsx                         → Root layout
  globals.css                        → Tokens del sistema de diseño

components/
  ui/                                → Primitivos shadcn
  layout/                            → Componentes transversales
  features/<dominio>/                → Componentes por dominio
  features/shared/                   → Compartidos

services/                            → Servicios de dominio y adaptadores de Queue
lib/                                 → Helpers puros, clock, auth y wrappers externos
schemas/                             → Zod
prisma/schema.prisma                 → Modelo completo
supabase/migrations/                 → Historia ejecutable de esquema
docs/archive/prisma-migrations/      → Historia heredada, solo referencia
proxy.ts                             → Gate grueso de identidad; cron exceptuado por path
```

## Request / data flow

```text
Request del browser
         ↓
proxy.ts
         ↓
app/api/v1/**/route.ts        ← Sentry HTTP trace
         ↓
auth-context.ts               ← span auth
         ↓
services/*.ts                 ← span por método público
         ↓
Prisma Client                 ← span por operación ORM
         ↓
PostgreSQL
```

Los handlers resuelven autorización dentro de su `try/catch`. Las operaciones multi-tabla usan `prisma.$transaction`; los puntos de concurrencia real usan locks explícitos (`FOR UPDATE` / `FOR UPDATE SKIP LOCKED`).

En local, PostgreSQL lo provee Supabase en `127.0.0.1:54322/postgres`. Ningún test destructivo debe apuntar a una base remota.

Para páginas del dashboard, los Server Components llaman services directamente; componentes cliente usan `/api/v1/*` para mutaciones y lecturas interactivas.

El detalle de liquidación ofrece un PDF A4 vertical generado en servidor desde la misma consulta sellada. El emisor visible es `Macchieraldo Villarruel — Estudio Contable & Inmobiliaria`; el nombre técnico del sistema no forma parte del documento entregado.

## Ajustes periódicos de contratos

`lib/ajustes-contrato.ts` decide si el próximo período requiere actualización. La fecha base es `fecha_ultimo_ajuste ?? fecha_inicio`; si faltan `indice_act` o `meses_act`, no se bloquea el cierre.

`services/ajustes-contrato.service.ts` administra `ajustes_contrato`. La restricción única `(id_contrato, periodo_efectivo)` hace idempotente la detección. Aplicar un ajuste toma locks `FOR UPDATE`, actualiza `Contrato.monto_base` y `fecha_ultimo_ajuste`, marca el ajuste `APLICADO` y garantiza una outbox `PENDIENTE` dentro de la misma transacción.

`ContratosService.avanzarPeriodo()` evalúa la regla **antes de cerrar** el período abierto. Ante `AJUSTE_PENDIENTE`, el período actual sigue `ABIERTO` y el siguiente no existe todavía. Una actualización ordinaria cambia `monto_base`; no crea un `Cargo AJUSTE`.

## Outbox + Vercel Queue para cierre de períodos

PostgreSQL es la fuente durable del trabajo y Vercel Queue es el mecanismo de entrega/ejecución:

```text
transacción de negocio
  └─ INSERT/garantía outbox PENDIENTE
COMMIT
  ↓
send("cierre-periodos", { outboxId })
  ↓
Vercel Queue
  ↓
app/api/queues/cierre-periodos/route.ts
  ↓
CierrePeriodosService.procesarFilaDeCola(outboxId)
  ↓
claim atómico PENDIENTE → PROCESANDO
  ↓
COMPLETADO / PENDIENTE con retry / ERROR
```

`procesarFilaDeCola(outboxId)` reclama únicamente el id recibido con `UPDATE ... WHERE id = ? AND estado = 'PENDIENTE' RETURNING`. Una entrega duplicada encuentra cero filas y termina como no-op. Los errores técnicos incrementan `intentos`; hasta el tercer intento la fila vuelve a `PENDIENTE`, y luego pasa a `ERROR`.

`encolarContratosVencidos()` devuelve los ids de las outboxes nuevas o ya pendientes. El cron mensual publica esos ids directamente a Queue.

La publicación ocurre después del commit, por lo que existe una ventana `COMMIT OK / send falló`. Para cubrirla, `/api/v1/cron/recuperar-cola-cierre` corre cada 5 minutos, busca `PENDIENTE` antiguas y republica sus `outboxId`. Así una falla de Queue no pierde el trabajo durable.

**Este flujo no usa `after()` ni self-fetch HTTP.** El endpoint legado `/api/v1/cron/procesar-cola-cierre` procesa una fila manualmente pero ya no encadena llamadas.

## Reloj de aplicación

Toda lógica temporal de negocio depende de `Clock` (`lib/clock.ts`) mediante `AppClock`:

- Producción: `SystemClock`, tiempo real.
- Local/Preview: `TestClock` cuando está habilitado.
- Preview: la fecha mutable vive en Vercel Blob privado (`inmotrack/test-clock.json`).

La UI `/dev/reloj` y su API son solo ADMIN. No introducir `new Date()`/`Date.now()` como fuente de tiempo de negocio dentro de services; convertir fechas explícitas o hacer aritmética calendaria sí es válido.

## Autenticación y perfiles

Supabase Auth es la autoridad de credenciales y sesiones. `lib/auth-context.ts` resuelve identidad + perfil de dominio en cada entrypoint protegido. `public.usuarios` no guarda contraseñas.

El flujo de invitación es server-only: ADMIN invita por Supabase Auth y se crea el perfil; si Prisma falla, se compensa eliminando la identidad recién creada.

## Low-signal / generated areas

| Path | Nature | Note |
|------|--------|------|
| `.superpowers/sdd/` | Notas de trabajo | Autoexcluido por `.gitignore` |
| `.superpowers/*.md` | Reportes de agentes | Historial de construcción, no producto |
| `supabase/migrations/` | Historia ejecutable | No editar una migración ya aplicada |
| `docs/archive/prisma-migrations/` | Historia Prisma heredada | Solo referencia |
| `components/ui/` | Componentes shadcn | Sin lógica de dominio |
