---
type: Overview
version: global-clock
validated: 2026-09-16
update_when: Purpose changes, new roles/actors added, or capability scope shifts
scope:
  - app
  - services
  - prisma/schema.prisma
---

# Overview — InmoTrack

## What it does

InmoTrack es el **sistema de gestión de una inmobiliaria/estudio contable** (Macchieraldo Villarruel) que administra alquileres por cuenta de terceros: contratos, cobros a inquilinos, gastos, punitorios por mora, y liquidación de lo cobrado a los propietarios de las propiedades.

Cuatro responsabilidades principales:

1. **Ciclo de vida de contratos y períodos** — alta de contrato, apertura/cierre automático de períodos mensuales de alquiler (cron), actualización periódica del monto de alquiler con bloqueo por ajuste pendiente, transición a `MOROSO`/`POR_VENCER`/`VENCIDO`.
2. **Cobranza** — registro de pagos de inquilinos con prelación fija (punitorios → alquiler/ajustes → gastos/confección, siempre el más viejo primero), cálculo de intereses punitorios bajo demanda, gastos a cargo de inquilino/propietario/inmobiliaria.
3. **Libro diario inmutable** — toda plata que se mueve queda como una fila de `Transaccion` que nunca se edita ni se borra; una corrección es siempre un contra-asiento nuevo, nunca un `UPDATE`.
4. **Liquidación a propietarios** — rendición de cuentas por rango de fechas (base caja, auto-encadenado), con soporte de adelantos de plata a cuenta que se descuentan de liquidaciones futuras.

## Identifiers

| Attribute | Value |
|-----------|-------|
| Nombre | InmoTrack |
| Lenguaje / runtime | TypeScript, Node.js |
| Framework | Next.js 16 (App Router, Turbopack) |
| ORM | Prisma 7 (`@prisma/adapter-pg`, driver `pg`) |
| Base de datos | PostgreSQL (local: `postgresql://gfrancone@localhost:5432/inmotrack`) |
| Auth | Supabase Auth (email/password e invitaciones); `public.usuarios.auth_user_id` UUID vincula identidad y perfil |
| UI | shadcn/ui ("base-nova") + Tailwind v4, estilo editorial tipo apple.com |
| Hosting objetivo | Vercel (cron jobs vía `vercel.json`) |
| Arquetipo | Monolito Next.js — rutas API finas, lógica de negocio en `services/` |
| Repo | Personal, un solo desarrollador — CI con Supabase local en GitHub Actions (ver [runbook.md](runbook.md)) |

## Roles

No hay multi-sitio ni multi-tenant — un solo despliegue, tres roles fijos. `proxy.ts` renueva cookies y aplica el gate grueso de identidad; cada route handler resuelve el perfil fresco con `lib/auth-context.ts` y aplica su permiso antes de leer o escribir.

| Rol | Puede escribir | Restricciones extra |
|-----|---------------|---------------------|
| `ADMIN` | Todo | Ninguna |
| `EMPLEADO` | Casi todo | Bloqueado en rutas `SOLO_ADMIN` (aprobar liquidación, contra-asiento, registrar adelanto — ver [contracts.md](contracts.md)) |
| `AUDITOR` | Nada (solo `GET`) | Además, PII (email/DNI/CBU/teléfono) se enmascara en las respuestas que llaman `aplicarMasking` (`lib/masking.ts`) — no es automático en todas las rutas, hay que revisar cada una |

## Reloj de aplicación

Toda lógica que necesita conocer "ahora" o "hoy" debe depender de la interfaz `Clock` de `lib/clock.ts`, inyectada por factory en los services. El composition root `lib/app-clock.ts` selecciona la implementación:

- **Producción (`VERCEL_ENV=production`)**: `SystemClock`, fecha/hora real de Argentina.
- **Local / Preview**: `TestClock`; si no hay fecha simulada configurada cae a la fecha real, y si existe una fecha simulada todo consumidor del `AppClock` observa la misma fecha.
- **Preview**: el estado del `TestClock` se guarda fuera de Postgres mediante Vercel Global Config (`lib/test-clock-store.ts`). La UI `/dev/reloj` modifica ese valor global; no usa cookies, headers ni scope por contrato.

Configuración de Preview:

- `GLOBAL_CONFIG`: la crea Vercel automáticamente al adjuntar `inmotrack-test-clock` al proyecto; incluye la connection string de lectura al store (`https://global-config.vercel.com/<globalConfigId>?token=<read-token>`). Las lecturas se hacen con `@vercel/global-config`.
- `VERCEL_TOKEN`: token de Vercel REST API con permisos de escritura sobre Global Config; se usa únicamente en el backend de Preview para que `/dev/reloj` pueda sobrescribir o borrar `inmotrack_test_date`.
- Los writes van a `https://api.vercel.com/v1/global-config/<globalConfigId>/items` y, como el store pertenece al Team de Vercel, deben incluir siempre `?teamId=<teamId>`. El runtime usa `VERCEL_TEAM_ID` y cae a `VERCEL_ORG_ID` si esa es la variable expuesta por el entorno.

Cuando se agrega o cambia `VERCEL_TOKEN` en Vercel, hace falta un redeploy del Preview una sola vez para que las funciones nuevas reciban esa env. Después, cambiar la fecha desde `/dev/reloj` no requiere nuevos deploys.

La fecha simulada **no** vive en una variable de entorno. Vive en la key mutable `inmotrack_test_date` de Global Config y se cambia en runtime desde `/dev/reloj`, sin redeploy.

No introducir `new Date()`/`Date.now()` como fuente de tiempo de negocio dentro de un service. Crear `Date` para convertir una fecha explícita o hacer aritmética calendaria sí es válido.

## Capability map

| Capability | Code location |
|-----------|--------------|
| Contratos (alta, activación, wizard) | `services/contratos.service.ts`, `components/features/contratos/WizardContrato.tsx` |
| Ajustes periódicos de alquiler (detección, historial, aplicación manual, reencolado) | `lib/ajustes-contrato.ts`, `services/ajustes-contrato.service.ts`, `components/features/contratos/ModalAjustesContrato.tsx` |
| Reloj global de aplicación y reloj de pruebas local/preview | `lib/clock.ts`, `lib/app-clock.ts`, `lib/test-clock-store.ts`, `app/(dashboard)/dev/reloj`, `app/api/v1/dev/reloj-pruebas/route.ts` |
| Confección de contrato (Cargo cobrable, con punitorios, sin Gasto) | `services/contratos.service.ts`, `services/pagos.service.ts`, `lib/cargos.ts` |
| Apertura/cierre automático de períodos (outbox + cron) | `services/cierre-periodos.service.ts`, `app/api/v1/cron/*` |
| Registrar pagos (prelación punitorios→alquiler→gastos/confección) | `services/pagos.service.ts` |
| Crédito flotante (sobrante de un cobro aplicado a deuda futura) | `services/creditos.service.ts` |
| Motor de punitorios (interés simple diario bajo demanda) | `services/punitorios.service.ts`, `lib/punitorios.ts` |
| Gastos (arreglo, expensas, gas, luz, impuesto) | `services/gastos.service.ts` |
| Libro diario / transacciones / contra-asientos | `services/transacciones.service.ts` |
| Liquidación a propietarios (selección por rango, grano dual) | `services/liquidaciones.service.ts` |
| Adelantos a propietarios (registrar, descontar con prelación por antigüedad) | `services/adelantos.service.ts` |
| Snapshot agregado del dashboard operativo/financiero | `services/dashboard.service.ts`, `services/dashboard-clock.service.ts`, `lib/dashboard/{filters,metrics,types}.ts` |
| Estado de cobranza / liquidación de un Cargo (derivado, nunca cacheado) | `lib/estado-cobranza.ts`, `lib/saldos.ts` |
| Auth y control de acceso por rol | `lib/supabase/{client,server,admin,proxy}.ts`, `lib/auth-context.ts`, `proxy.ts`, `services/usuarios.service.ts` |

## Specs

Este repo usa el flujo `superpowers` (brainstorming → spec → implementación) en vez de tickets externos — la historia de decisiones de diseño vive en el propio repo:

- Specs de diseño: [`docs/superpowers/specs/`](../superpowers/specs/) (un archivo por feature grande: modelo financiero, motor de períodos, cierre de períodos, motor de punitorios, liquidaciones+adelantos)
- Planes de implementación: [`docs/superpowers/plans/`](../superpowers/plans/)
- Deuda técnica y hallazgos pendientes: [`docs/superpowers/plans/TODO.md`](../superpowers/plans/TODO.md) — **leer antes de asumir que algo "falta" es un bug nuevo**, puede que ya esté anotado con la razón por la que se dejó así.
- Documento de arquitectura original (bootstrap del proyecto): [`SDD.md`](../../SDD.md)

<!-- deploy-check: 2026-09-15T21:32-03:00 -->
