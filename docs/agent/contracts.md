---
type: Contracts
version: 4957633
validated: 2026-09-14
update_when: Rutas HTTP agregadas/cambiadas/eliminadas, o cambia el criterio de acceso por rol en proxy.ts/handlers
scope:
  - app/api
  - proxy.ts
  - schemas
---

# Contracts — InmoTrack

## Auth — cómo leer la columna "Acceso" de abajo

El `proxy.ts` renueva cookies y aplica solo el gate grueso de identidad (ver [architecture.md](architecture.md)); cada handler vuelve a resolver el perfil del servidor:

- **Sesión requerida** en todo `/api/v1/*` excepto `/api/v1/cron/*` (esas usan `CRON_SECRET`, no sesión).
- **`AUDITOR`** solo puede `GET` en cualquier ruta — el chequeo vive en cada handler mediante `assertCanWrite`.
- **ADMIN** se exige en rutas de alto impacto y en la invitación de usuarios; la verificación no depende de metadata del cliente.
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
| `POST` | `/contratos/{id}/activar` | Activar contrato (BORRADOR → ACTIVO), crea primer período y, si corresponde, el Cargo de confección | No-AUDITOR | ❌ |
| `PATCH` | `/contratos/{id}/estado` | Cambiar estado manualmente (cualquier transición del enum) | No-AUDITOR | ✅ |
| `GET` | `/contratos/{id}/cargos-pendientes` | Cargos con saldo > 0 de un contrato | Sesión | ✅ |
| `GET` | `/contratos/{id}/periodos` | Períodos de pago de un contrato | Sesión | ✅ |
| `POST` | `/contratos/{id}/calcular-intereses` | Correr el motor de punitorios sobre cargos elegidos | No-AUDITOR | ✅ (lock + `@@unique([id_cargo_origen, fecha_punitorio_desde])`) |
| `GET` | `/inquilinos` | Listar inquilinos | Sesión | ✅ |
| `POST` | `/inquilinos` | Crear inquilino | No-AUDITOR | ❌ |
| `GET` | `/inquilinos/{id}/saldo` | Deuda total (alquiler+ajustes+punitorios+gastos+confección) | Sesión | ✅ |
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
| `POST` | `/pagos` | Registrar un cobro (prelación punitorios→alquiler→gastos/confección) | No-AUDITOR | ✅ vía `idempotency_key` (UUID obligatorio en el body) |
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
| `POST` | `/usuarios` | Invitar usuario y crear su perfil | **ADMIN** | ❌ |
| `PATCH` | `/usuarios` | Delegar `puede_aprobar_liquidaciones` a un EMPLEADO | **ADMIN** (chequeo propio en el handler, no en `SOLO_ADMIN`) | ✅ |

### Respuesta de saldo del inquilino

`GET /inquilinos/{id}/saldo` separa `deuda_confeccion` de `deuda_gastos` y
la incluye en `total`. El detalle correspondiente se devuelve en
`detalle_confeccion`; una confección nunca aparece como `Gasto`.

### Cron (`/api/v1/cron/*` — sin auth de sesión, `Authorization: Bearer $CRON_SECRET`)

| Method | Path | Qué hace | Disparado por |
|--------|------|----------|---------------|
| `GET` | `/cron/activar-cierre-periodos` | Encola contratos vencidos, marca `POR_VENCER`, dispara la cola vía `after()` | Vercel Cron, `0 6 1 * *` (`vercel.json`) |
| `POST` | `/cron/procesar-cola-cierre` | Procesa UNA fila de `outbox_cierre_periodo`; si queda trabajo, se re-dispara a sí mismo vía `after()` | Encadenado desde el cron de arriba, o manualmente |

`/cron/*` está explícitamente exceptuado del auth de sesión en `proxy.ts` (`pathname.startsWith("/api/v1/cron/")`) — la única protección es `CRON_SECRET`.

## Auth Supabase

El login y logout usan los clientes SSR de Supabase. `/auth/confirm` acepta solamente `token_hash` con `type=invite`, establece cookies mediante `verifyOtp` y redirige a la pantalla para crear contraseña. Las credenciales viven en Auth; `public.usuarios` solo guarda el perfil y `auth_user_id`.

## Dependencias externas

Supabase provee PostgreSQL como dependencia externa. No hay otras APIs de terceros,
colas de mensajería ni caché externo (Redis/KVS).

## Recursos de plataforma

| Tipo | Recurso | Para qué | Fallo |
|------|---------|----------|-------|
| PostgreSQL/Supabase | `DATABASE_URL` (obligatoria) | Conexión de runtime; única fuente de persistencia | Sin retry — Prisma tira, la ruta responde 500 vía `handleServiceError` |
| PostgreSQL/Supabase | `DIRECT_URL` (obligatoria) | Conexión directa de Prisma CLI para validar/generar y operaciones de esquema | El comando Prisma falla sin ejecutarse |
| Vercel Cron | `vercel.json` → `/api/v1/cron/activar-cierre-periodos` | Dispara el cierre mensual de períodos | Sin retry automático — el próximo cron mensual vuelve a encontrar lo que quedó sin procesar |

## Telemetría emitida

Ninguna. No hay métricas custom, no hay tracing/OTel, no hay dashboards. En producción,
`lib/db.ts` configura Prisma con logging de errores solamente.
