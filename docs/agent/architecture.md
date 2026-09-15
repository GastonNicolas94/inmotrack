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
| Validación | `schemas/*.schema.ts` | Zod schemas, uno por recurso. Los usan tanto las rutas API como los forms del lado cliente. |
| Servicios (lógica de negocio) | `services/*.ts` | Toda regla de negocio y toda llamada a Prisma vive acá. Exporta un objeto `XxxService` con métodos async. Operaciones multi-tabla van dentro de `prisma.$transaction`. |
| Helpers puros | `lib/*.ts` | Funciones sin I/O (cálculos de fecha, saldos, prelación, punitorios, calendario de ajustes) o wrappers finos sobre recursos externos. Se testean sin base de datos. |
| UI | `components/**`, `app/(dashboard)/**`, `app/(auth)/**` | Server Components para listar; Client Components (`"use client"`) para estado/submit. |

## Folder layout

```text
app/
  (auth)/login/
  (dashboard)/
    contratos/, gastos/, inquilinos/, liquidaciones/, pagos/, propiedades/, propietarios/, transacciones/
    contratos/[id]/movimientos/
    liquidaciones/[id]/
  api/
    auth/confirm/
    auth/confirm/password/
    v1/
      contratos/, gastos/, inquilinos/, liquidaciones/, pagos/, propiedades/, propietarios/, transacciones/, usuarios/
      cron/
  layout.tsx
  globals.css

components/
  ui/
  layout/
  features/<dominio>/
  features/shared/

services/
lib/
  dashboard/
schemas/
tests/
  lib/, services/, db/, helpers/
prisma/
  schema.prisma
  seed.ts
supabase/
  config.toml
  migrations/
docs/archive/prisma-migrations/
proxy.ts
lib/auth-context.ts
services/usuarios.service.ts
```

## Request / data flow

```text
Request del browser
         ↓
proxy.ts
         ↓
app/api/v1/**/route.ts
  — auth + parse + Zod
         ↓
services/*.ts
  — lógica de negocio + transacciones + locks cuando corresponde
         ↓
Prisma Client → PostgreSQL/Supabase
```

En local, PostgreSQL lo provee Supabase en `127.0.0.1:54322/postgres`. La aplicación usa `DATABASE_URL`; Prisma CLI usa `DIRECT_URL`. Los tests destructivos solo pueden apuntar al Supabase local canónico.

Para las páginas del dashboard, el Server Component llama al service directamente; los componentes cliente hacen `fetch()` a `/api/v1/*` para mutaciones y lecturas interactivas.

El segmento `app/(dashboard)/` define `loading.tsx` como fallback de navegación. Los listados usan `Suspense` y `TableLoadingSkeleton`. La página de contratos mantiene un límite independiente para `ContratosWizardData`.

El detalle de liquidación ofrece un PDF A4 vertical generado en servidor desde la misma consulta sellada. El endpoint `/api/v1/liquidaciones/[id]/pdf` usa runtime Node.js, no cachea y presenta a `Macchieraldo Villarruel — Estudio Contable & Inmobiliaria` como emisor.

Los listados usan `select` explícito y relaciones mínimas alineadas con la UI.

## Ajustes periódicos de contratos

`lib/ajustes-contrato.ts` contiene la regla pura que decide si el período objetivo requiere actualización. La base temporal es `fecha_ultimo_ajuste ?? fecha_inicio`; si el contrato no tiene `indice_act` o `meses_act`, no hay bloqueo automático.

`services/ajustes-contrato.service.ts` persiste el historial en `ajustes_contrato`. La restricción única `(id_contrato, periodo_efectivo)` hace idempotente la detección. Aplicar un ajuste bloquea con `SELECT ... FOR UPDATE`, actualiza transaccionalmente `Contrato.monto_base` + `fecha_ultimo_ajuste`, marca el ajuste `APLICADO` y reencola el contrato.

`ContratosService.avanzarPeriodo()` consulta la regla **antes de cerrar el período abierto**. Devuelve una condición de negocio explícita:

```text
AVANZADO
AJUSTE_PENDIENTE
```

Ante `AJUSTE_PENDIENTE` no cierra el período actual ni abre el siguiente. Una actualización ordinaria del alquiler modifica `monto_base`; no crea un `Cargo AJUSTE`.

## Outbox pattern (cierre de períodos)

`services/cierre-periodos.service.ts` mantiene el patrón outbox:

1. `encolarContratosVencidos()` encuentra contratos con período `ABIERTO` vencido y crea filas `PENDIENTE`, o marca `VENCIDO` si `fecha_fin` ya pasó.
2. `procesarUnaFilaDeCola()` reclama una fila con `FOR UPDATE SKIP LOCKED` y avanza períodos hasta alcanzar el mes actual.
3. Si `avanzarPeriodo()` devuelve `AJUSTE_PENDIENTE`, el loop se corta exactamente en ese período y la fila se marca `COMPLETADO`: es una condición funcional esperada, no consume retries.
4. Cuando un operador aplica el ajuste, `AjustesContratoService.aplicar()` crea una nueva fila `PENDIENTE` si no existe otra y el cierre continúa usando el nuevo monto.
5. Las excepciones técnicas conservan el retry de hasta 3 intentos antes de `ERROR`.

No hay un worker/cola externo; el consumidor es el cron de Vercel.

## Autenticación y perfiles

Supabase Auth es la autoridad de credenciales y sesiones. `proxy.ts` renueva la sesión; `lib/auth-context.ts` resuelve identidad + perfil de dominio y cada handler aplica autorización server-side.

Los ajustes respetan la política general: historial GET para cualquier sesión y aplicación POST solo para ADMIN/EMPLEADO mediante `assertCanWrite`; AUDITOR permanece read-only.

## Low-signal / generated areas

| Path | Nature | Note |
|------|--------|------|
| `.superpowers/sdd/` | Notas de trabajo del flujo superpowers | Autoexcluido; nunca se commitea |
| `.superpowers/*.md` | Reportes de tareas de subagentes | Historial de construcción, no documentación de producto |
| `supabase/migrations/` | Historia ejecutable de migraciones SQL | No editar una migración ya aplicada |
| `docs/archive/prisma-migrations/` | Historia Prisma heredada | Solo referencia |
| `components/ui/` | Componentes shadcn generados | Sin lógica de dominio |
