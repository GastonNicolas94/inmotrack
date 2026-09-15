---
type: Architecture
version: b0da4ff
validated: 2026-09-15
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

```
app/
  (auth)/login/                      → Página de login, fuera del dashboard shell
  (dashboard)/                       → Layout con nav lateral (DashboardShell); una carpeta por sección
    contratos/, gastos/, inquilinos/, liquidaciones/, pagos/, propiedades/, propietarios/, transacciones/
    contratos/[id]/movimientos/      → Detalle de movimientos de un contrato puntual
    liquidaciones/[id]/              → Detalle auditable de una liquidación puntual
  api/
    auth/confirm/                    → Valida la invitación y establece cookies
    auth/confirm/password/           → Pantalla autenticada para fijar contraseña
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

services/                            → Un archivo por agregado de negocio (ver overview.md → Capability map), más `dashboard.service.ts` para snapshots agregados server-only
lib/                                 → fecha.ts, saldos.ts, cargos.ts, prelacion.ts, punitorios.ts, ajustes-contrato.ts, masking.ts, serialize.ts,
                                        estado-cobranza.ts, confeccion-contrato.ts, idempotency.ts, cron-auth.ts, db.ts, auth.ts, errors.ts, api-error-handler.ts
  dashboard/                         → public DTO contracts (`types.ts`), URL filters/date ranges (`filters.ts`),
                                        decimal-safe financial calculations and chart view models (`metrics.ts`)
schemas/                             → Un *.schema.ts por recurso (zod)
tests/
  lib/, services/, db/, helpers/     → node:test — ver runbook.md
prisma/
  schema.prisma                      → Modelo de datos completo (fuente de verdad)
  seed.ts                            → Datos de demo
supabase/
  config.toml                        → Configuración de Supabase local (Postgres en 54322)
  migrations/                         → Única historia ejecutable; aplicada por `npx supabase db reset`/push
docs/archive/prisma-migrations/       → Historia Prisma heredada, solo referencia no ejecutable
proxy.ts                             → Renueva cookies Supabase y bloquea identidad ausente; deja `/login`, el callback exacto `/auth/confirm` y `/api/v1/cron/*` públicos
lib/auth-context.ts                  → Resuelve identidad Supabase + perfil `usuarios` y autoriza por rol en el servidor
services/usuarios.service.ts         → Invitaciones Admin, creación de perfil y compensación de identidades Auth
```

## Request / data flow

```
Request del browser
         ↓
proxy.ts (runtime compatible con el proxy de Next.js)
  — sin identidad → 401/redirect a /login
  — renueva cookies con `getClaims`; no decide roles
         ↓
app/api/v1/**/route.ts
  — resuelve `requireAuthenticatedUser`/`requireAdmin`, parsea body/params, valida con schemas/*.schema.ts (zod)
         ↓
services/*.ts
  — lógica de negocio; para operaciones multi-tabla, todo dentro de prisma.$transaction
  — locks pesimistas explícitos (`SELECT ... FOR UPDATE` / `FOR UPDATE SKIP LOCKED`) donde hay
    concurrencia real (pagos, liquidaciones, cierre de períodos, punitorios, aplicación de ajustes) — Prisma no da
    locking optimista/pesimista de forma nativa acá, se hace con $queryRawUnsafe/$queryRaw
         ↓
Prisma Client (adapter-pg) → PostgreSQL
```

En local, PostgreSQL lo provee Supabase en `127.0.0.1:54322/postgres` y requiere
Docker Desktop (o un daemon compatible). La aplicación usa `DATABASE_URL`; Prisma
CLI usa `DIRECT_URL` desde `prisma.config.ts`. En una instalación remota pueden ser
endpoints distintos (pooler para runtime y conexión directa para migraciones), pero
ningún test destructivo debe apuntar allí.

Para las páginas del dashboard (no-API), el flujo es más corto: el Server Component (`TablaXxx.tsx`) llama al `service` directamente (sin pasar por HTTP), y los componentes cliente (`ModalXxx.tsx`) hacen `fetch()` a las mismas rutas `/api/v1/*` que usaría un cliente externo.

El segmento `app/(dashboard)/` define `loading.tsx` como fallback de navegación. Next.js lo
anida dentro de `DashboardShell`, por lo que el sidebar y el header compartidos permanecen
montados mientras el Server Component de la página resuelve sus datos. El fallback vive en
`components/layout/DashboardLoadingSkeleton.tsx`: es un Server Component accesible (`role="status"`)
con un header y seis filas, y usa exclusivamente los tokens de `globals.css` para su superficie,
borde y animación.

Cada listado del dashboard coloca su `Tabla*` dentro de un límite `Suspense` propio, con
`components/layout/TableLoadingSkeleton.tsx` como fallback compartido. Así el `PageHeader` y
los filtros se pueden enviar antes de que termine la consulta Prisma, mientras la tarjeta de
tabla conserva su superficie, borde y seis filas de estado de carga. La página de contratos
mantiene además un límite independiente en la acción del header: `ContratosWizardData` resuelve
las propiedades e inquilinos disponibles y recién entonces renderiza `WizardContrato`, sin
cambiar sus props ni sus permisos.

El detalle de liquidación ofrece un PDF A4 vertical generado en servidor desde la misma consulta
sellada. El endpoint autenticado `/api/v1/liquidaciones/[id]/pdf` fuerza runtime Node.js, responde
como archivo no cacheable y mantiene una maquetación formal multipágina separada de la UI web.
El documento omite el estado y cualquier sección sin movimientos asociados.
El emisor visible y los metadatos identifican a `Macchieraldo Villarruel — Estudio Contable &
Inmobiliaria`; el nombre técnico del sistema no forma parte del documento entregado.

Los métodos de listado que alimentan estas tablas usan `select` explícito y relaciones anidadas
mínimas. El shape de cada consulta se mantiene alineado con los campos leídos por su `Tabla*`;
las relaciones de `TransaccionesService.listar` que necesita la UI (`contra_asientos` y
`usuario_creador.email`) se conservan explícitamente.

## Ajustes periódicos de contratos

`lib/ajustes-contrato.ts` contiene la regla pura que decide si el próximo período requiere actualización. La fecha base es `fecha_ultimo_ajuste ?? fecha_inicio`; si faltan `indice_act` o `meses_act`, el contrato no bloquea el cierre por ajuste.

`services/ajustes-contrato.service.ts` administra `ajustes_contrato`. La restricción única `(id_contrato, periodo_efectivo)` hace idempotente la detección. Aplicar un ajuste usa locks `FOR UPDATE`, actualiza `Contrato.monto_base` y `fecha_ultimo_ajuste`, marca el ajuste `APLICADO` con usuario/timestamp y vuelve a encolar el contrato en la misma transacción.

`ContratosService.avanzarPeriodo()` ejecuta la regla **antes de cerrar** el período abierto. El resultado de negocio distingue `AVANZADO` de `AJUSTE_PENDIENTE`. Ante un pendiente, el período actual sigue `ABIERTO` y el siguiente no existe todavía. Una actualización ordinaria cambia `monto_base`; no crea un `Cargo AJUSTE`.

La UI de `/contratos` expone el pendiente y el historial mediante `ModalAjustesContrato`; el Dashboard Operativo cuenta y lista ajustes pendientes.

## Outbox pattern (cierre de períodos)

`services/cierre-periodos.service.ts` es el único lugar del repo con un patrón outbox real:

1. `encolarContratosVencidos()` (cron mensual) encuentra contratos con un período `ABIERTO` vencido y los encola en `outbox_cierre_periodo` (`PENDIENTE`) — o los pasa directo a `VENCIDO` si `fecha_fin` ya pasó.
2. `procesarUnaFilaDeCola()` (cron frecuente) reclama UNA fila con `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING` y avanza períodos en loop hasta alcanzar el mes actual.
3. Si el próximo período requiere actualización, `ContratosService.avanzarPeriodo()` devuelve `AJUSTE_PENDIENTE`: el loop se corta exactamente allí, la fila se marca `COMPLETADO` y no consume retries técnicos.
4. Al aplicar el ajuste, `AjustesContratoService.aplicar()` reencola el contrato; la siguiente corrida continúa desde el período que quedó abierto y usa el nuevo `monto_base`.
5. Las excepciones técnicas conservan el comportamiento previo: reintenta hasta 3 veces antes de marcar `ERROR`.

No hay un worker/cola real — el "consumidor" es el propio cron de Vercel llamando al endpoint repetidamente.

## Autenticación y perfiles

Supabase Auth es la única autoridad de credenciales y sesiones. `lib/supabase/server.ts` usa el adaptador SSR para leer/escribir cookies; `proxy.ts` renueva la sesión sin autorizar roles. `lib/auth-context.ts` valida la identidad con `getClaims` y consulta `public.usuarios` por `auth_user_id` en cada entrypoint protegido. `public.usuarios` no guarda contraseñas.

El flujo de invitación es server-only: `POST /api/v1/usuarios` exige ADMIN, llama a `inviteUserByEmail` con `${APP_URL}/auth/confirm` y crea el perfil. Si Prisma falla, elimina la identidad recién creada. `/auth/confirm` valida `token_hash` con `verifyOtp({ type: "invite" })`, persiste cookies y redirige a `/auth/confirm/password`; esa pantalla ejecuta `updateUser({ password })` y entra al dashboard.

Los endpoints de ajustes siguen la política general: el historial es GET autenticado; aplicar un ajuste exige un usuario no-AUDITOR mediante `assertCanWrite`.

## Low-signal / generated areas

| Path | Nature | Note |
|------|--------|------|
| `.superpowers/sdd/` | Notas de trabajo del flujo superpowers | Autoexcluido por su propio `.gitignore` (`*`) — nunca se commitea |
| `.superpowers/*.md` | Reportes de tareas de subagentes | Historial de construcción, no documentación de producto |
| `supabase/migrations/` | Historia ejecutable de migraciones SQL | No editar una migración ya aplicada — ver runbook.md |
| `docs/archive/prisma-migrations/` | Historia Prisma heredada | Solo referencia; nunca la ejecute Prisma o Supabase |
| `components/ui/` | Componentes shadcn generados por el CLI | Ajustar tema/variantes ahí está bien; no meter lógica de dominio |
