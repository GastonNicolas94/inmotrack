---
type: Contracts
version: contract-rent-adjustments-queue
validated: 2026-09-17
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
| ADMIN | Solo ADMIN (vía `requireAdmin`) |

## Rutas HTTP (`/api/v1/*`)

| Method | Path | Intención | Acceso | Idempotente |
|--------|------|-----------|--------|-------------|
| `GET` | `/contratos` | Listar contratos | Sesión | ✅ |
| `POST` | `/contratos` | Crear contrato (estado inicial BORRADOR) | No-AUDITOR | ❌ |
| `POST` | `/contratos/{id}/activar` | Activar contrato (BORRADOR → ACTIVO), crea primer período y, si corresponde, el Cargo de confección | No-AUDITOR | ❌ |
| `PATCH` | `/contratos/{id}/estado` | Cambiar estado manualmente (cualquier transición del enum) | No-AUDITOR | ✅ |
| `GET` | `/contratos/{id}/cargos-pendientes` | Cargos con saldo > 0 de un contrato | Sesión | ✅ |
| `GET` | `/contratos/{id}/periodos` | Períodos de pago de un contrato | Sesión | ✅ |
| `GET` | `/contratos/{id}/ajustes` | Historial auditable de actualizaciones de alquiler | Sesión | ✅ |
| `POST` | `/contratos/{id}/ajustes/{idAjuste}/aplicar` | Aplicar monto nuevo a un ajuste pendiente y reencolar el cierre | No-AUDITOR | ✅ por estado/lock: un ajuste solo pasa una vez a `APLICADO` |
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
| `GET` | `/liquidaciones/{id}` | Detalle auditable de cobros, gastos y adelantos incluidos | Sesión | ✅ |
| `POST` | `/liquidaciones` | Generar liquidación (`id_propietario`, `hasta`, `descontar_adelantos`) | No-AUDITOR | ❌ (auto-encadenado por `desde`, ver traps.md) |
| `POST` | `/liquidaciones/{id}/aprobar` | Aprobar (genera `EGRESO_LIQUIDACION`) — rechaza si `monto_neto < 0` | No-AUDITOR (chequeo propio: ADMIN o `puede_aprobar_liquidaciones`) | ✅ |
| `POST` | `/liquidaciones/{id}/confirmar-pago` | Confirmar pago de una liquidación aprobada | **ADMIN** | ✅ |
| `GET` | `/transacciones` | Libro diario (filtros `tipo`, `caja`, `desde`, `hasta`) | Sesión | ✅ |
| `POST` | `/transacciones/contra-asiento` | Reversar una transacción con una fila espejo | **ADMIN** | ❌ |
| `GET` | `/usuarios` | Listar usuarios | Sesión | ✅ |
| `POST` | `/usuarios` | Invitar usuario y crear su perfil | **ADMIN** | ❌ |
| `PATCH` | `/usuarios` | Delegar `puede_aprobar_liquidaciones` a un EMPLEADO | **ADMIN** | ✅ |
| `GET` | `/dev/reloj-pruebas` | Leer reloj global de Preview/local | **ADMIN** | ✅ |
| `POST` | `/dev/reloj-pruebas` | Cambiar reloj global y opcionalmente ejecutar cierres | **ADMIN** | ❌ |
| `DELETE` | `/dev/reloj-pruebas` | Volver al reloj real | **ADMIN** | ✅ |

### Ajustes de contrato

`GET /contratos/{id}/ajustes` devuelve el historial ordenado del más reciente al más antiguo; los `Decimal` salen serializados como strings.

`POST /contratos/{id}/ajustes/{idAjuste}/aplicar` acepta:

```json
{
  "monto_nuevo": 600000,
  "observacion": "Actualización trimestral ICL"
}
```

`monto_nuevo` debe ser positivo y `observacion` es opcional (máximo 500 caracteres). La operación bloquea ajuste/contrato, exige estado `PENDIENTE`, actualiza `monto_base` + `fecha_ultimo_ajuste`, marca el ajuste `APLICADO` y garantiza una `outbox_cierre_periodo(PENDIENTE)` dentro de la misma transacción. Después del commit intenta publicar `{ outboxId }` en Vercel Queue. Si esa publicación falla, el ajuste sigue aplicado y la outbox queda durable para el cron de recuperación.

### Respuesta de saldo del inquilino

`GET /inquilinos/{id}/saldo` separa `deuda_confeccion` de `deuda_gastos` y la incluye en `total`. El detalle correspondiente se devuelve en `detalle_confeccion`; una confección nunca aparece como `Gasto`.

### Queue y cron de cierres

| Method / trigger | Path / topic | Qué hace | Disparado por |
|---|---|---|---|
| `GET` | `/cron/activar-cierre-periodos` | Encola contratos vencidos, marca `POR_VENCER` y publica cada `outboxId` en Queue | Vercel Cron, `0 6 1 * *` |
| Queue subscriber | topic `cierre-periodos` → `/api/queues/cierre-periodos` | Reclama y procesa exactamente la outbox indicada por el mensaje | Vercel Queue |
| `GET` | `/cron/recuperar-cola-cierre` | Busca `PENDIENTE` antiguas y republica sus ids | Vercel Cron, `*/5 * * * *` |
| `POST` | `/cron/procesar-cola-cierre` | Procesa manualmente una única fila pendiente; queda como endpoint operativo/compatibilidad | Invocación manual autenticada con `CRON_SECRET` |

No se usa `after()` ni self-fetch HTTP para sostener la cola. `/cron/*` está exceptuado del auth de sesión en `proxy.ts`; la protección de esos endpoints es `CRON_SECRET`.

## Auth Supabase

El login y logout usan los clientes SSR de Supabase. `/auth/confirm` acepta solamente `token_hash` con `type=invite`, establece cookies mediante `verifyOtp` y redirige a la pantalla para crear contraseña. Las credenciales viven en Auth; `public.usuarios` solo guarda el perfil y `auth_user_id`.

## Dependencias externas

Supabase provee PostgreSQL. Vercel Queue entrega trabajo de cierre a un subscriber serverless y Vercel Cron ejecuta la activación mensual y el recovery periódico. La primera versión de ajustes **no** consulta APIs externas de ICL/IPC: el operador carga el nuevo monto manualmente.

## Recursos de plataforma

| Tipo | Recurso | Para qué | Fallo |
|------|---------|----------|-------|
| PostgreSQL/Supabase | `DATABASE_URL` | Persistencia y outbox durable | Prisma propaga el error; la ruta responde vía `handleServiceError` |
| PostgreSQL/Supabase | `DIRECT_URL` | Prisma CLI / validación de esquema | El comando Prisma falla sin ejecutarse |
| Vercel Queue | topic `cierre-periodos` | Entrega `{ outboxId }` al consumer | La outbox permanece `PENDIENTE`; recovery la republica |
| Vercel Cron | `/api/v1/cron/activar-cierre-periodos` | Descubrimiento mensual de contratos a avanzar | La siguiente corrida o recovery vuelve a cubrir pendientes persistidos |
| Vercel Cron | `/api/v1/cron/recuperar-cola-cierre` | Republicar outboxes huérfanas | Se reintenta en la próxima corrida de 5 minutos |

## Telemetría emitida

No hay métricas custom ni tracing/OTel todavía. Los fallos de publicación a Queue se registran con `console.error`; `lib/db.ts` mantiene Prisma con logging de errores.
