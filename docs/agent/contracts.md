---
type: Contracts
version: 37d97fb6e
validated: 2026-09-09
update_when: Rutas HTTP agregadas/cambiadas/eliminadas, o cambia el criterio de acceso por rol en middleware.ts
scope:
  - app/api
  - middleware.ts
  - schemas
---

# Contracts — InmoTrack

## Auth — cómo leer la columna "Acceso" de abajo

Todo pasa primero por `middleware.ts` (ver [architecture.md](architecture.md)):

- **Sesión requerida** en todo `/api/v1/*` excepto `/api/v1/cron/*` (esas usan `CRON_SECRET`, no sesión).
- **`AUDITOR`** solo puede `GET` en cualquier ruta — cualquier otro método le da 403, sin necesidad de que la ruta esté en `SOLO_ADMIN`.
- **`SOLO_ADMIN`** (array method-aware en `middleware.ts`) exige rol `ADMIN` en rutas puntuales de alto impacto (mueven plata real e inmutable): confirmar pago de liquidación, contra-asiento, registrar adelanto (solo el `POST`, el `GET` de esa misma ruta queda abierto).
- Todo lo demás: cualquier sesión válida no-AUDITOR puede escribir (`ADMIN` o `EMPLEADO`).

| Acceso | Significado |
|--------|-------------|
| Sesión | Cualquier rol autenticado (incluye AUDITOR solo si es GET) |
| No-AUDITOR | ADMIN o EMPLEADO |
| ADMIN | Solo ADMIN (vía `SOLO_ADMIN` o chequeo propio del handler) |

## Rutas HTTP (`/api/v1/*`)

| Method | Path | Intención | Acceso | Idempotente |
|--------|------|-----------|--------|-------------|
| `GET` | `/contratos` | Listar contratos | Sesión | ✅ |
| `POST` | `/contratos` | Crear contrato (estado inicial BORRADOR) | No-AUDITOR | ❌ |
| `POST` | `/contratos/{id}/activar` | Activar contrato (BORRADOR → ACTIVO), crea primer período | No-AUDITOR | ❌ |
| `PATCH` | `/contratos/{id}/estado` | Cambiar estado manualmente (cualquier transición del enum) | No-AUDITOR | ✅ |
| `GET` | `/contratos/{id}/cargos-pendientes` | Cargos con saldo > 0 de un contrato | Sesión | ✅ |
| `GET` | `/contratos/{id}/periodos` | Períodos de pago de un contrato | Sesión | ✅ |
| `POST` | `/contratos/{id}/calcular-intereses` | Correr el motor de punitorios sobre cargos elegidos | No-AUDITOR | ✅ (lock + `@@unique([id_cargo_origen, fecha_punitorio_desde])`) |
| `GET` | `/inquilinos` | Listar inquilinos | Sesión | ✅ |
| `POST` | `/inquilinos` | Crear inquilino | No-AUDITOR | ❌ |
| `GET` | `/inquilinos/{id}/saldo` | Deuda total (alquiler+ajustes+punitorios+gastos) | Sesión | ✅ |
| `GET` | `/propiedades` | Listar propiedades | Sesión | ✅ |
| `POST` | `/propiedades` | Crear propiedad | No-AUDITOR | ❌ |
| `GET` | `/propietarios` | Listar propietarios | Sesión | ✅ |
| `POST` | `/propietarios` | Crear propietario | No-AUDITOR | ❌ |
| `GET` | `/propietarios/{id}` | Detalle de propietario | Sesión | ✅ |
| `PATCH` | `/propietarios/{id}` | Editar propietario (parcial) | No-AUDITOR | ✅ |
| `GET` | `/propietarios/{id}/resumen` | Resumen financiero del propietario | Sesión | ✅ |
| `GET` | `/propietarios/{id}/adelantos` | Adelantos pendientes (total + detalle por antigüedad) | Sesión | ✅ |
| `POST` | `/propietarios/{id}/adelantos` | Registrar un adelanto (`EGRESO_ADELANTO`) | **ADMIN** | ❌ |
| `GET` | `/pagos` | Pagos recientes (todos los contratos) | Sesión | ✅ |
| `POST` | `/pagos` | Registrar un cobro (prelación punitorios→alquiler→gastos) | No-AUDITOR | ✅ vía `idempotency_key` (UUID obligatorio en el body) |
| `GET` | `/gastos` | Listar gastos | Sesión | ✅ |
| `POST` | `/gastos` | Cargar un gasto | No-AUDITOR | ❌ |
| `PATCH` | `/gastos/{id}/marcar-pagado` | Marcar gasto como pagado al proveedor | No-AUDITOR | ✅ |
| `GET` | `/liquidaciones` | Listar liquidaciones (filtro opcional `?id_propietario=`) | Sesión | ✅ |
| `POST` | `/liquidaciones` | Generar liquidación (`id_propietario`, `hasta`, `descontar_adelantos`) | No-AUDITOR | ❌ (auto-encadenado por `desde`, ver traps.md) |
| `POST` | `/liquidaciones/{id}/aprobar` | Aprobar (genera `EGRESO_LIQUIDACION`) — rechaza si `monto_neto < 0` | No-AUDITOR (chequeo propio: ADMIN o `puede_aprobar_liquidaciones`) | ✅ |
| `POST` | `/liquidaciones/{id}/confirmar-pago` | Confirmar pago de una liquidación aprobada | **ADMIN** | ✅ |
| `GET` | `/transacciones` | Libro diario (filtros `tipo`, `caja`, `desde`, `hasta`) | Sesión | ✅ |
| `POST` | `/transacciones/contra-asiento` | Reversar una transacción con una fila espejo | **ADMIN** | ❌ |
| `GET` | `/usuarios` | Listar usuarios | Sesión | ✅ |
| `PATCH` | `/usuarios` | Delegar `puede_aprobar_liquidaciones` a un EMPLEADO | **ADMIN** (chequeo propio en el handler, no en `SOLO_ADMIN`) | ✅ |

### Cron (`/api/v1/cron/*` — sin auth de sesión, `Authorization: Bearer $CRON_SECRET`)

| Method | Path | Qué hace | Disparado por |
|--------|------|----------|---------------|
| `GET` | `/cron/activar-cierre-periodos` | Encola contratos vencidos, marca `POR_VENCER`, dispara la cola vía `after()` | Vercel Cron, `0 6 1 * *` (`vercel.json`) |
| `POST` | `/cron/procesar-cola-cierre` | Procesa UNA fila de `outbox_cierre_periodo`; si queda trabajo, se re-dispara a sí mismo vía `after()` | Encadenado desde el cron de arriba, o manualmente |

`/cron/*` está explícitamente exceptuado del auth de sesión en `middleware.ts` (`pathname.startsWith("/api/v1/cron/")`) — la única protección es `CRON_SECRET`.

## Auth de NextAuth

`GET`/`POST` en `/api/auth/[...nextauth]` — manejado enteramente por NextAuth (login, logout, sesión). Provider `Credentials` (email+password, bcrypt) definido en `lib/auth.ts`.

## Dependencias externas

Ninguna. No hay APIs de terceros, no hay colas de mensajería, no hay caché externo (Redis/KVS). Toda la persistencia es un único Postgres.

## Recursos de plataforma

| Tipo | Recurso | Para qué | Fallo |
|------|---------|----------|-------|
| PostgreSQL | `DATABASE_URL` (fallback hardcodeado a `postgresql://gfrancone@localhost:5432/inmotrack` en `lib/db.ts` y `prisma.config.ts` si la env var no está) | Única fuente de persistencia | Sin retry — Prisma tira, la ruta responde 500 vía `handleServiceError` |
| Vercel Cron | `vercel.json` → `/api/v1/cron/activar-cierre-periodos` | Dispara el cierre mensual de períodos | Sin retry automático — el próximo cron mensual vuelve a encontrar lo que quedó sin procesar |

## Telemetría emitida

Ninguna. No hay métricas custom, no hay tracing/OTel, no hay dashboards. `lib/db.ts` loguea cada query de Prisma a stdout (`log: ["query"]`, sin gate por `NODE_ENV` — ver traps.md) — es el único "observability" del repo hoy.
