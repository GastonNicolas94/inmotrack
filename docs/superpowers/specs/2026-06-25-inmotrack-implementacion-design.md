# InmoTrack — Diseño de Implementación
**Fecha:** 2026-06-25
**Estado:** Aprobado
**Referencia:** SDD.md (versión 1.0 Final)

---

## Decisiones de Stack (cerradas)

| Dimensión | Decisión | Justificación |
|---|---|---|
| Arquitectura | Vertical Slicing | Visibilidad temprana, desriesga infraestructura antes |
| Estrategia de setup | Schema Prisma completo primero (Enfoque C) | SDD totalmente especificado, sin descubrimiento incremental |
| API pública / mutaciones | Route Handlers puros (`/api/v1/...`) | Testeable con Postman, control total de HTTP, ready para webhooks |
| Lecturas en Server Components | DAL directo (sin fetch interno) | Anti-patrón documentado por Next.js; cero latencia de red interna |
| Lógica de negocio | Service Layer compartido (DAL) | Server Components y Route Handlers consumen las mismas funciones |
| Auth | Auth.js custom credentials + JWT, desde Fase 0 | RBAC impacta todas las rutas; imposible agregar después sin refactor mayor |
| UI | shadcn/ui + Tailwind CSS | DataTable + Form + Dialog listos; compatible con Server Components |
| Validación | Zod en `/schemas`; tipos inferidos en el mismo archivo | Fuente única de verdad por entidad; sin carpeta `/types` separada |

---

## Arquitectura de Capas

```
┌─────────────────────────────────────────────┐
│  Browser                                    │
│  Client Component → fetch('/api/v1/...')    │
└───────────────────┬─────────────────────────┘
                    │ HTTP
┌───────────────────▼─────────────────────────┐
│  middleware.ts (raíz del proyecto)           │
│  · Valida JWT de cookie de sesión            │
│  · Verifica rol contra matriz RBAC           │
│  · Bloquea con 403 si no tiene acceso        │
└───────────────────┬─────────────────────────┘
                    │
        ┌───────────┴────────────┐
        │                        │
┌───────▼────────┐    ┌──────────▼──────────┐
│ Route Handler  │    │  Server Component   │
│ (mutaciones /  │    │  (render inicial /  │
│  API pública)  │    │   filtros por URL)  │
└───────┬────────┘    └──────────┬──────────┘
        │  Schema Zod            │  directo
        │  (valida input)        │
        └──────────┬─────────────┘
                   │
        ┌──────────▼──────────┐
        │   Service Layer     │  ← /services/*.service.ts
        │   (lógica negocio)  │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │   Prisma ORM        │  ← /lib/db.ts (singleton)
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │   PostgreSQL        │
        └─────────────────────┘
```

---

## Estructura de Carpetas

```
/inmotrack
├── middleware.ts                        ← RAÍZ (detectado por Next.js)
├── next.config.ts
├── package.json
│
├── /app
│   ├── /api/v1
│   │   ├── /auth/[...nextauth]/route.ts
│   │   ├── /pagos/route.ts
│   │   ├── /contratos/route.ts
│   │   ├── /contratos/[id]/route.ts
│   │   ├── /contratos/[id]/estado/route.ts
│   │   ├── /contratos/[id]/actualizar-monto/route.ts
│   │   ├── /liquidaciones/route.ts
│   │   ├── /liquidaciones/pendientes/route.ts
│   │   ├── /liquidaciones/[id]/aprobar/route.ts
│   │   ├── /liquidaciones/[id]/confirmar-pago/route.ts
│   │   ├── /gastos/route.ts
│   │   ├── /inquilinos/route.ts
│   │   ├── /inquilinos/[id]/saldo/route.ts
│   │   ├── /propietarios/route.ts
│   │   ├── /propietarios/[id]/resumen/route.ts
│   │   ├── /propiedades/route.ts
│   │   ├── /transacciones/route.ts
│   │   ├── /reportes/caja/route.ts
│   │   └── /cron/verificar-mora/route.ts
│   │
│   ├── /(auth)                          ← Sin layout de dashboard
│   │   └── /login/page.tsx
│   │
│   └── /(dashboard)                     ← Protegido por middleware
│       ├── layout.tsx                   ← Shell: sidebar + header
│       ├── page.tsx                     ← Redirect → /contratos
│       ├── /contratos/page.tsx
│       ├── /propietarios/page.tsx
│       ├── /inquilinos/page.tsx
│       ├── /liquidaciones/page.tsx
│       ├── /transacciones/page.tsx
│       └── /reportes/page.tsx
│
├── /lib
│   ├── db.ts                            ← Singleton Prisma (patrón global para dev)
│   ├── auth.ts                          ← Auth.js: custom credentials + JWT config
│   └── errors.ts                        ← Tipos de error estándar del SDD
│
├── /services                            ← DAL: toda la lógica de negocio
│   ├── propietarios.service.ts
│   ├── propiedades.service.ts
│   ├── inquilinos.service.ts
│   ├── contratos.service.ts
│   ├── pagos.service.ts                 ← Prelación, locking, idempotencia
│   ├── gastos.service.ts
│   ├── liquidaciones.service.ts
│   ├── transacciones.service.ts
│   └── cron.service.ts                  ← Lógica de mora y punitorios
│
├── /schemas                             ← Zod + tipos inferidos (fuente única)
│   ├── propietario.schema.ts            ← export type PropietarioInput = z.infer<...>
│   ├── propiedad.schema.ts
│   ├── inquilino.schema.ts
│   ├── contrato.schema.ts
│   ├── pago.schema.ts                   ← incluye idempotency_key: z.string().uuid()
│   ├── gasto.schema.ts
│   └── liquidacion.schema.ts
│
├── /components
│   ├── /ui                              ← shadcn/ui (generados, no editar)
│   └── /features
│       ├── /propietarios
│       │   ├── TablaPropietarios.tsx    ← Server Component + DataTable
│       │   └── FormPropietario.tsx      ← Client Component + react-hook-form
│       ├── /contratos
│       │   ├── TablaContratos.tsx
│       │   ├── WizardContrato.tsx       ← Multi-step form
│       │   └── BadgeEstadoContrato.tsx
│       ├── /pagos
│       │   └── ModalRegistrarPago.tsx   ← Input numérico controlado (type="number", min=0)
│       ├── /liquidaciones
│       │   ├── TablaLiquidaciones.tsx
│       │   └── ModalAprobarLiquidacion.tsx
│       └── /transacciones
│           └── TablaLibroDiario.tsx     ← DataTable con filtros por tipo y fecha
│
└── /prisma
    ├── schema.prisma                    ← 11 tablas, escrito completo en Fase 0
    ├── seed.ts                          ← Usuario Admin inicial
    └── /migrations
        └── /20260625000000_init         ← Una sola migración inicial
```

---

## Convención de Nombres

| Capa | Patrón | Ejemplo |
|---|---|---|
| Route Handler | `app/api/v1/{recurso}/route.ts` | `app/api/v1/pagos/route.ts` |
| Service | `services/{recurso}.service.ts` | `services/pagos.service.ts` |
| Schema Zod | `schemas/{recurso}.schema.ts` | `schemas/pago.schema.ts` |
| Componente tabla | `features/{recurso}/Tabla{Recurso}.tsx` | `features/contratos/TablaContratos.tsx` |
| Componente formulario | `features/{recurso}/Form{Recurso}.tsx` | `features/contratos/FormContrato.tsx` |
| Componente modal | `features/{recurso}/Modal{Accion}.tsx` | `features/pagos/ModalRegistrarPago.tsx` |

---

## Fases de Implementación

### Fase 0 — Foundation (1 día)

Setup de infraestructura completo antes de cualquier feature.

**Tareas:**
1. `create-next-app` con TypeScript, Tailwind, App Router, ESLint
2. Instalar dependencias:
   ```bash
   # Auth.js v5 (beta) es requerido — v4 no soporta el middleware del App Router
   npm install prisma @prisma/client next-auth@beta zod react-hook-form @hookform/resolvers bcryptjs
   npm install -D @types/bcryptjs prisma
   npx shadcn@latest init
   ```
3. Instalar componentes shadcn: `button input form table dialog toast badge dropdown-menu avatar separator`
4. Escribir `/prisma/schema.prisma` completo (11 tablas del SDD)
5. `prisma migrate dev --name init` — migración única
6. Configurar `lib/db.ts` con patrón singleton para dev
7. Configurar `lib/auth.ts` — custom credentials, JWT con `{ id, email, rol, id_propietario }`
8. Escribir `middleware.ts` en raíz — valida JWT, aplica RBAC por ruta
9. Crear layout de `/(auth)` y `/(dashboard)` con sidebar básico
10. `prisma/seed.ts` — insertar usuario Admin inicial
11. `prisma db seed` — verificar login funciona end-to-end

**Criterio de salida:** `/login` autentica, redirige al dashboard, el sidebar muestra el rol del usuario, las rutas sin auth devuelven redirect a login.

---

### Vertical 1 — Entidades Base (2-3 días)

**Entrega visible:** tablas de propietarios y propiedades con alta y edición.

| Sub-tarea | Detalle |
|---|---|
| `schemas/propietario.schema.ts` | Validar nombre (min 2 chars), CBU (22 dígitos exactos con `z.string().length(22)`) |
| `schemas/propiedad.schema.ts` | Validar dirección, id_propietario requerido, es_propia boolean |
| `services/propietarios.service.ts` | `listar()`, `crear()`, `obtenerPorId()`, `actualizar()` |
| `services/propiedades.service.ts` | `listar({ id_propietario? })`, `crear()`, `obtenerPorId()` |
| Route Handlers propietarios | `GET /api/v1/propietarios`, `POST /api/v1/propietarios`, `GET/PATCH /api/v1/propietarios/[id]` |
| Route Handlers propiedades | `GET /api/v1/propiedades?id_propietario={}`, `POST /api/v1/propiedades` |
| `TablaPropietarios.tsx` | Server Component, DataTable con columnas: nombre, CBU enmascarado, cant. propiedades |
| `FormPropietario.tsx` | Client Component, react-hook-form + zod, validación de CBU en tiempo real |
| `TablaPropiedades.tsx` | Badge `es_propia` destacado visualmente |

**Criterio de salida:** la admin puede crear un propietario, asignarle una propiedad, y verlos en las tablas.

---

### Vertical 2 — Contratos e Inquilinos (3-4 días)

**Entrega visible:** alta de inquilinos + wizard de creación de contrato + activación que genera el primer período.

| Sub-tarea | Detalle |
|---|---|
| `schemas/inquilino.schema.ts` | DNI/CUIT con regex argentino, email válido, teléfono |
| `schemas/contrato.schema.ts` | Fechas (fin > inicio), monto_base > 0, pct_comision 0-100, pct_punitorio_diario 0-1, indice_act ENUM |
| `services/inquilinos.service.ts` | `listar()`, `crear()`, `obtenerSaldo()` — suma periodos_pago pendientes + punitorios |
| `services/contratos.service.ts` | `listar({ estado?, id_propietario?, id_inquilino? })`, `crear()`, `activar()` — activar genera primer `periodos_pago` |
| `PATCH /api/v1/contratos/[id]/estado` | Valida balance en cero antes de RESCINDIDO |
| `WizardContrato.tsx` | 4 pasos: selección propietario → propiedad → inquilino → condiciones financieras |
| `BadgeEstadoContrato.tsx` | Colores: verde=ACTIVO, amarillo=MOROSO, rojo=VENCIDO, gris=BORRADOR/RESCINDIDO |

**Criterio de salida:** contrato creado y activado, `periodos_pago` tiene un registro `CARGO_PENDIENTE` para el mes actual.

---

### Vertical 3 — Núcleo Financiero (5-7 días)

#### 3a — Registro de Pagos

El endpoint más crítico del sistema.

| Sub-tarea | Detalle |
|---|---|
| `schemas/pago.schema.ts` | `id_contrato`, `monto_pagado` (> 0, DECIMAL seguro con `z.number().positive()`), `idempotency_key` (UUID v4) |
| `services/pagos.service.ts` | Algoritmo completo: 1) check idempotency_key, 2) prelación (punitorios → capital por período más antiguo), 3) `SELECT FOR UPDATE` sobre periodos_pago, 4) insertar en transacciones, 5) actualizar monto_cobrado + estado período, 6) calcular y transferir comisión, 7) evaluar transición MOROSO → ACTIVO |
| `POST /api/v1/pagos/registrar` | Wrappear en `prisma.$transaction()`, devolver 409 si idempotency_key ya existe |
| `ModalRegistrarPago.tsx` | `<input type="number" min="0" step="0.01">` controlado, muestra saldo deudor actual antes de confirmar, botón deshabilitado durante submit |

**Notas de implementación:**
- El pessimistic lock se implementa con `prisma.$queryRaw\`SELECT * FROM periodos_pago WHERE id_contrato = ${id} FOR UPDATE\``
- La tabla `idempotency_keys` se consulta dentro de la misma transacción de Prisma

#### 3b — Gastos

| Sub-tarea | Detalle |
|---|---|
| `schemas/gasto.schema.ts` | id_contrato, monto > 0, proveedor, concepto, fecha_gasto |
| `services/gastos.service.ts` | `crear()`, `listarPorContrato()`, `marcarPagado()` |
| Route Handlers | `GET/POST /api/v1/gastos`, `PATCH /api/v1/gastos/[id]` |
| UI | Formulario de carga de gasto dentro de la vista de contrato |

**Razón del orden:** `LiquidacionesService` hace un join con gastos pendientes. Si gastos existe primero, la query de liquidación es real desde el primer día.

#### 3c — Liquidaciones

| Sub-tarea | Detalle |
|---|---|
| `services/liquidaciones.service.ts` | `generarParaPropietario(id_propietario)` — crea `liquidaciones` + `liquidaciones_items` con join real a gastos; `aprobar(id)` — crea egresos en transacciones con `SELECT FOR UPDATE`; `confirmarPago(id)` |
| Route Handlers | `GET /api/v1/liquidaciones/pendientes?id_propietario=`, `POST /api/v1/liquidaciones/[id]/aprobar`, `POST /api/v1/liquidaciones/[id]/confirmar-pago` |
| `ModalAprobarLiquidacion.tsx` | Muestra desglose por propiedad (liquidaciones_items), botón de aprobación con confirmación explícita |

#### 3d — Cron de Mora y Punitorios

| Sub-tarea | Detalle |
|---|---|
| `services/cron.service.ts` | `verificarMora()`: busca periodos_pago vencidos, marca VENCIDO_IMPAGO, inserta PUNITORIO_DIARIO en transacciones (id_usuario_creador = null), actualiza contratos con ≥ 2 períodos impagos a MOROSO, limpia idempotency_keys > 24h |
| `POST /api/v1/cron/verificar-mora` | Verifica header `Authorization: Bearer ${CRON_SECRET}`, delega a `cron.service.ts` |
| Script de testing | Seed de desarrollo: `prisma/scripts/forzar-vencimiento.ts` — actualiza `fecha_vencimiento` de periodos_pago a una fecha pasada para testear el cron sin esperar |

#### 3e — Libro Diario y Contra-asientos

| Sub-tarea | Detalle |
|---|---|
| `services/transacciones.service.ts` | `listar({ id_contrato?, desde?, hasta?, tipo?, page, limit })`, `crearContraAsiento()` — solo rol ADMIN, valida id_txn_origen existe, inserta con comentario obligatorio |
| `GET /api/v1/transacciones` | Filtros + paginación |
| `TablaLibroDiario.tsx` | Columnas: fecha, tipo (badge por color), caja, monto (rojo/verde), contrato, usuario (NULL = Sistema) |
| Data masking | `transacciones.service.ts` aplica máscara de strings si `session.rol === 'AUDITOR'` antes de retornar |

---

### Vertical 4 — Reportes y Cierre (2-3 días)

| Sub-tarea | Detalle |
|---|---|
| `GET /api/v1/reportes/caja?tipo={}&desde={}&hasta={}` | Suma de ingresos, egresos y balance del período por caja |
| `GET /api/v1/propietarios/[id]/resumen` | Dashboard del propietario: propiedades activas, última liquidación, monto pendiente |
| `GET /api/v1/inquilinos/[id]/saldo` | Balance consolidado: suma de monto_cargo - monto_cobrado de periodos_pago + punitorios acumulados |
| Página `/reportes` | Selector de rango de fechas, gráfico de barras de flujo por caja (shadcn + recharts — instalar `recharts` en Vertical 4) |
| Data masking completo | Aplicar en todos los endpoints que devuelvan campos sensibles de inquilinos/propietarios cuando `rol === 'AUDITOR'` |
| Delegación de permisos | UI para que el Admin asigne/revoque `CAN_APPROVE_LIQUIDATIONS` a un Empleado |

---

## Reglas de Implementación

### Manejo de errores en Route Handlers

Todos los Route Handlers devuelven el formato estándar del SDD:

```typescript
// lib/errors.ts
export function errorResponse(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>
) {
  return NextResponse.json({ error_code: code, message, details }, { status })
}

// Uso en route handler:
return errorResponse('CONTRATO_NOT_FOUND', 'El contrato no existe.', 404, { id })
```

### Data masking

Función helper en `lib/auth.ts`:

```typescript
export function maskSensitiveFields<T extends Record<string, unknown>>(
  data: T,
  rol: string
): T {
  if (rol !== 'AUDITOR') return data
  return {
    ...data,
    dni_cuit: data.dni_cuit ? maskDni(data.dni_cuit as string) : undefined,
    email: data.email ? maskEmail(data.email as string) : undefined,
    cbu: data.cbu ? maskCbu(data.cbu as string) : undefined,
  }
}
```

### Singleton Prisma para desarrollo

```typescript
// lib/db.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ log: ['query'] })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

### Variables de entorno requeridas

```env
DATABASE_URL="postgresql://..."
NEXTAUTH_SECRET="..."          # mínimo 32 chars aleatorios
NEXTAUTH_URL="http://localhost:3000"
CRON_SECRET="..."              # API key para el cron job
```

---

## Criterios de Éxito por Fase

| Fase | Criterio observable |
|---|---|
| Fase 0 | Login funciona, dashboard carga, rutas sin auth redirigen a login |
| Vertical 1 | Admin puede crear propietarios y propiedades, verlos en tablas |
| Vertical 2 | Contrato activado genera `periodos_pago` con estado `CARGO_PENDIENTE` |
| Vertical 3a | Pago registrado actualiza `periodos_pago`, genera transacciones, 409 en doble submit |
| Vertical 3b | Gasto cargado aparece en la vista del contrato |
| Vertical 3c | Liquidación aprobada genera egresos en transacciones, pasa a APROBADA |
| Vertical 3d | Cron detecta período vencido, inserta `PUNITORIO_DIARIO`, contrato pasa a MOROSO |
| Vertical 3e | Libro diario muestra todas las transacciones con filtros funcionales |
| Vertical 4 | Reporte de caja muestra balance correcto para el rango de fechas dado |
