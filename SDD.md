# SDD — InmoTrack: Sistema de Gestión Inmobiliaria
**Versión:** 2.0
**Fecha:** 2026-09-10
**Stack:** Next.js 16 · TypeScript · Supabase (PostgreSQL + Auth + Realtime) · Prisma ORM

---

## Índice

1. [Visión General del Sistema](#1-visión-general-del-sistema)
2. [Flujo de Fondos y Reglas de Negocio](#2-flujo-de-fondos-y-reglas-de-negocio)
3. [Modelo de Datos](#3-modelo-de-datos)
4. [Diseño de la API](#4-diseño-de-la-api)
5. [Máquinas de Estado](#5-máquinas-de-estado)
6. [Roles y Permisos (RBAC)](#6-roles-y-permisos-rbac)
7. [Seguridad Financiera y Casos Borde](#7-seguridad-financiera-y-casos-borde)
8. [Stack Técnico y Arquitectura](#8-stack-técnico-y-arquitectura)
9. [Autenticación y Autorización](#9-autenticación-y-autorización)
10. [Deployment y Secrets](#10-deployment-y-secrets)
11. [Referencia: ENUMs del Sistema](#11-referencia-enums-del-sistema)

---

## 1. Visión General del Sistema

InmoTrack es un sistema de gestión inmobiliaria diseñado para administrar propiedades de terceros y propiedades propias. Su función principal es automatizar el ciclo completo de cobro–liquidación–pago, garantizando la separación contable del dinero de terceros del dinero de la inmobiliaria, con trazabilidad inmutable de cada movimiento.

### Principio Rector

> **El libro diario es sagrado.** Ninguna fila de la tabla `transacciones` puede ser borrada ni modificada. Los errores se corrigen con contra-asientos. La integridad contable no es negociable.

---

## 2. Flujo de Fondos y Reglas de Negocio

### 2.1 Las Dos Cajas

El sistema separa física y lógicamente el dinero en dos cajas:

| Caja | Nombre | Qué entra | Qué sale |
|---|---|---|---|
| **CAJA 1** | Cuenta Recaudadora / Terceros | 100% de los pagos de inquilinos, depósitos en garantía, expensas | Liquidaciones a propietarios, pagos a proveedores, expensas al consorcio, comisiones (→ CAJA 2), devolución de depósitos |
| **CAJA 2** | Cuenta Operativa / Ganancias | Comisiones de administración, honorarios, transferencias desde CAJA 1 por propiedades propias | Gastos operativos del negocio (sueldos, servicios, etc.) |

**Regla absoluta:** ningún gasto del negocio se paga desde CAJA 1. Nunca.

### 2.2 Desglose Automático de un Pago (Flujo Normal)

Cuando un inquilino paga el alquiler de una propiedad administrada (no propia):

```
Pago del Inquilino
       │
       ▼
  [CAJA 1] ── INGRESO_COBRO ──────────────────── Monto bruto ingresado
       │
       ├── TRANSFERENCIA_INTERNA → [CAJA 2] ─── Comisión (pct_comision % del monto cobrado)
       │
       ├── Retención en CAJA 1 ────────────────── Gastos/arreglos pendientes del período
       │
       └── EGRESO_LIQUIDACION → CBU Propietario ─ Monto neto (bruto − comisión − gastos)
```

### 2.3 Excepción: Propiedades Propias (`es_propia = TRUE`)

Para propiedades de titularidad de la inmobiliaria, el sistema genera **dos transacciones atómicas**:

1. `INGRESO_COBRO` a CAJA 1 — garantiza que el ingreso bruto aparezca en el libro diario.
2. `TRANSFERENCIA_INTERNA` del 100% de CAJA 1 a CAJA 2 — sin retenciones de comisión ni liquidación a propietario.

**Por qué atómico:** si el proceso falla entre el paso 1 y el 2, la base de datos hace rollback completo. El contador nunca verá un ingreso en CAJA 1 sin su correspondiente transferencia.

### 2.4 Expensas

Si el contrato estipula que el inquilino paga las expensas a través de la inmobiliaria:

- El monto de expensas entra a CAJA 1 como `INGRESO_COBRO` con concepto diferenciado.
- Queda retenido en CAJA 1 hasta el pago al consorcio.
- Al pagar al consorcio, se registra como `EGRESO_TERCEROS`.
- Las expensas **no devengan comisión** y **no forman parte de la liquidación al propietario**.

### 2.5 Depósito en Garantía

- Al firmar el contrato: `INGRESO_GARANTIA` en CAJA 1. Es un **pasivo** (deuda hacia el inquilino). El sistema nunca calcula comisión sobre este ingreso.
- Al finalizar el contrato: `EGRESO_GARANTIA` desde CAJA 1 hacia el inquilino (total o parcial según daños registrados en `depositos_garantia`).

### 2.6 Acreditación de Comisiones

La comisión se **devenga y transfiere a CAJA 2 en el momento exacto** en que se registra el cobro (sea total o parcial), calculándose proporcionalmente sobre el monto efectivamente cobrado:

```
Comisión = monto_cobrado × (pct_comision / 100)
```

### 2.7 Pagos Parciales

Si el inquilino paga menos del monto total del período:

- La comisión se calcula sobre lo cobrado (proporcional).
- El resto queda como saldo deudor en `periodos_pago` con estado `COBRADO_PARCIAL`.
- El sistema aplica la **prelación de pagos** (ver sección 7.3) al imputar el monto.

### 2.8 Ajuste por Inflación (Contexto Argentina)

Los contratos soportan actualización periódica del canon locativo mediante índices oficiales. El campo `indice_act` del contrato indica el índice aplicable (ICL, IPC, acuerdo entre partes). El campo `meses_act` indica la periodicidad. La actualización se ejecuta manualmente mediante `POST /api/v1/contratos/{id}/actualizar-monto` o puede automatizarse vía cron.

---

## 3. Modelo de Datos

**Precisión monetaria:** todos los campos de dinero usan `DECIMAL(15,2)` para soportar inflación proyectada en contexto argentino.

### 3.1 Entidades de Negocio

#### `propietarios`
| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | INT | PK, AUTO_INCREMENT | |
| `nombre` | VARCHAR(255) | NOT NULL | |
| `cbu` | VARCHAR(22) | NOT NULL | CBU bancario para liquidaciones |

#### `inquilinos`
| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | INT | PK, AUTO_INCREMENT | |
| `nombre` | VARCHAR(255) | NOT NULL | |
| `dni_cuit` | VARCHAR(20) | NOT NULL | Dato sensible — enmascarar para AUDITOR |
| `email` | VARCHAR(255) | UNIQUE | Dato sensible — enmascarar para AUDITOR |
| `telefono` | VARCHAR(20) | | Dato sensible — enmascarar para AUDITOR |

#### `propiedades`
| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | INT | PK, AUTO_INCREMENT | |
| `id_propietario` | INT | FK → propietarios.id, NOT NULL | |
| `direccion` | VARCHAR(500) | NOT NULL | |
| `es_propia` | BOOLEAN | NOT NULL, DEFAULT FALSE | Activa el flujo de caja directa |

#### `contratos`
| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | INT | PK, AUTO_INCREMENT | |
| `id_propiedad` | INT | FK → propiedades.id, NOT NULL | |
| `id_inquilino` | INT | FK → inquilinos.id, NOT NULL | |
| `fecha_inicio` | DATE | NOT NULL | |
| `fecha_fin` | DATE | NOT NULL | |
| `estado` | ENUM | NOT NULL, DEFAULT 'BORRADOR' | Ver sección 11 |
| `monto_base` | DECIMAL(15,2) | NOT NULL | Canon locativo inicial |
| `pct_comision` | DECIMAL(5,2) | NOT NULL | Porcentaje de comisión de la inmobiliaria |
| `pct_punitorio_diario` | DECIMAL(5,4) | NOT NULL, DEFAULT 0.1000 | Tasa diaria de interés moratorio (0.1% = ~3% mensual) |
| `indice_act` | ENUM | NULLABLE | ICL, IPC, ACUERDO — índice de actualización |
| `meses_act` | INT | NULLABLE | Periodicidad de actualización en meses |

### 3.2 Entidades Contables

#### `periodos_pago`

Persiste el estado de cobro de cada período mensual por contrato. Es la fuente de verdad de la deuda del inquilino.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | INT | PK, AUTO_INCREMENT | |
| `id_contrato` | INT | FK → contratos.id, NOT NULL | |
| `periodo` | VARCHAR(7) | NOT NULL | Formato "YYYY-MM" (ej: "2026-06") |
| `monto_cargo` | DECIMAL(15,2) | NOT NULL | Monto devengado para el período |
| `monto_cobrado` | DECIMAL(15,2) | NOT NULL, DEFAULT 0.00 | Acumulado de pagos del inquilino |
| `estado` | ENUM | NOT NULL, DEFAULT 'CARGO_PENDIENTE' | Ver sección 11 |
| `fecha_vencimiento` | DATE | NOT NULL | Día límite antes de devengarse punitorios |

**Restricción única:** `(id_contrato, periodo)` — impide duplicar cargos del mismo mes.

#### `transacciones`

Libro diario inmutable. **Prohibido DELETE y UPDATE.** Los errores se corrigen con contra-asientos.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | INT | PK, AUTO_INCREMENT | |
| `tipo` | ENUM | NOT NULL | Ver sección 11 — define el flujo contable |
| `caja_destino` | ENUM('TERCEROS', 'OPERATIVA') | NOT NULL | Caja afectada por el movimiento |
| `monto` | DECIMAL(15,2) | NOT NULL | Positivo = ingreso, Negativo = egreso |
| `fecha_transaccion` | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Momento exacto del movimiento |
| `id_contrato` | INT | FK → contratos.id, NULLABLE | Desnormalizado para auditoría directa sin joins |
| `id_usuario_creador` | INT | FK → usuarios.id, NULLABLE | NULL = generado por el sistema (cron job) |
| `id_txn_origen` | INT | FK → transacciones.id, NULLABLE | Solo para CONTRA_ASIENTO: apunta a la txn anulada |
| `comentario` | TEXT | NULLABLE | Obligatorio cuando tipo = CONTRA_ASIENTO |

#### `liquidaciones`

Snapshot de cada corrida mensual de liquidación por propietario.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | INT | PK, AUTO_INCREMENT | |
| `id_propietario` | INT | FK → propietarios.id, NOT NULL | |
| `fecha_corrida` | TIMESTAMP | NOT NULL | Cuándo se generó la liquidación |
| `monto_bruto` | DECIMAL(15,2) | NOT NULL | Suma de alquileres cobrados en el período |
| `retenciones` | DECIMAL(15,2) | NOT NULL | Comisiones + gastos descontados |
| `monto_neto` | DECIMAL(15,2) | NOT NULL | Lo que efectivamente recibe el propietario |
| `estado` | ENUM | NOT NULL, DEFAULT 'PENDIENTE' | PENDIENTE → APROBADA → PAGADA |

#### `liquidaciones_items`

Desagregación de la liquidación por contrato/propiedad. Permite que el propietario vea el detalle de cada inmueble dentro de una liquidación global.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | INT | PK, AUTO_INCREMENT | |
| `id_liquidacion` | INT | FK → liquidaciones.id, ON DELETE CASCADE, NOT NULL | |
| `id_contrato` | INT | FK → contratos.id, NOT NULL | |
| `monto_bruto` | DECIMAL(15,2) | NOT NULL | |
| `comision` | DECIMAL(15,2) | NOT NULL | |
| `gastos` | DECIMAL(15,2) | NOT NULL | |
| `monto_neto` | DECIMAL(15,2) | NOT NULL | |

### 3.3 Entidades Operativas

#### `gastos`

Retenciones por arreglos o servicios a proveedores, descontadas de la próxima liquidación.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | INT | PK, AUTO_INCREMENT | |
| `id_contrato` | INT | FK → contratos.id, NOT NULL | |
| `monto` | DECIMAL(15,2) | NOT NULL | |
| `proveedor` | VARCHAR(255) | NOT NULL | |
| `concepto` | TEXT | | Descripción del trabajo realizado |
| `fecha_gasto` | DATE | NOT NULL | |
| `estado_pago` | ENUM('PENDIENTE', 'PAGADO_PROVEEDOR') | NOT NULL, DEFAULT 'PENDIENTE' | |

#### `depositos_garantia`

Ciclo de vida del depósito en garantía de cada contrato.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | INT | PK, AUTO_INCREMENT | |
| `id_contrato` | INT | FK → contratos.id, UNIQUE, NOT NULL | Un depósito por contrato |
| `monto_original` | DECIMAL(15,2) | NOT NULL | Monto recibido al firmar |
| `monto_retenido_danos` | DECIMAL(15,2) | NOT NULL, DEFAULT 0.00 | Retención por daños al finalizar |
| `monto_devuelto` | DECIMAL(15,2) | NOT NULL, DEFAULT 0.00 | Lo efectivamente devuelto al inquilino |
| `estado` | ENUM | NOT NULL, DEFAULT 'RETENIDO' | Ver sección 11 |
| `fecha_resolucion` | TIMESTAMP | NULLABLE | Cuándo se cerró el ciclo |
| `id_usuario_autorizante` | INT | FK → usuarios.id, NULLABLE | Admin que autorizó la devolución/retención |

#### `idempotency_keys`

Prevención de pagos duplicados por doble clic o re-envío de formulario.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `key` | VARCHAR(36) | PK | UUID generado por el frontend al cargar el formulario |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | |
| `response_status` | INT | NOT NULL | HTTP status de la respuesta original |

El cron job nocturno ejecuta `DELETE FROM idempotency_keys WHERE created_at < NOW() - INTERVAL '24 hours'`.

### 3.4 Entidades de Sistema

#### `usuarios`

Entidad de acceso desacoplada del modelo de negocio. No confundir con `propietarios`.

| Campo | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | INT | PK, AUTO_INCREMENT | |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL | |
| `auth_user_id` | UUID | UNIQUE, NOT NULL | Identidad administrada por Supabase Auth |
| `rol` | ENUM('ADMIN', 'EMPLEADO', 'AUDITOR') | NOT NULL | |
| `id_propietario` | INT | FK → propietarios.id, NULLABLE | Solo si el usuario del sistema también es propietario |

---

## 4. Diseño de la API

### 4.1 Formato Estándar de Errores

Todas las respuestas de error (HTTP 4xx / 5xx) siguen este esquema:

```json
{
  "error_code": "INSUFFICIENT_FUNDS",
  "message": "El monto ingresado no es válido.",
  "details": {
    "field": "monto_pagado"
  }
}
```

### 4.2 Endpoints Transaccionales Core

#### `POST /api/v1/pagos/registrar`
Registra un pago de inquilino. Aplica la prelación de pagos, calcula comisiones en tiempo real y actualiza `periodos_pago`.

**Payload:**
```json
{
  "id_contrato": 1042,
  "monto_pagado": 300000.00,
  "idempotency_key": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

**Lógica interna (en transacción atómica):**
1. Verificar `idempotency_key` contra tabla `idempotency_keys`. Si existe → HTTP 409.
2. Aplicar prelación de pagos (ver sección 7.3).
3. Calcular y transferir comisión a CAJA 2 (`TRANSFERENCIA_INTERNA`).
4. Actualizar `periodos_pago.monto_cobrado` y `estado`.
5. Evaluar si el contrato debe cambiar de estado (`MOROSO` → `ACTIVO` si períodos `VENCIDO_IMPAGO` < 2).
6. Persistir `idempotency_key` con el status de respuesta.

#### `POST /api/v1/contratos`
Crea un contrato y registra el depósito en garantía (`INGRESO_GARANTIA`).

#### `POST /api/v1/gastos`
Carga un arreglo o gasto a proveedor. Se descuenta de la próxima liquidación del contrato.

#### `PATCH /api/v1/contratos/{id}/estado`
Transiciones controladas de estado del contrato. Para transicionar a `RESCINDIDO`, valida previamente que no existan períodos en estado distinto a `COBRADO_TOTAL`.

#### `POST /api/v1/contratos/{id}/actualizar-monto`
Ejecuta el ajuste por ICL/IPC. Actualiza `monto_base` del contrato y genera el `periodos_pago` del próximo período con el monto actualizado.

### 4.3 Endpoints de Liquidación

#### `GET /api/v1/liquidaciones/pendientes?id_propietario={id}&page={n}&limit={n}`
Devuelve liquidaciones pendientes filtradas por propietario con paginación.

**Respuesta:**
```json
{
  "data": [
    {
      "id": 88,
      "id_propietario": 3,
      "monto_bruto": 900000.00,
      "retenciones": 45000.00,
      "monto_neto": 855000.00,
      "estado": "PENDIENTE",
      "items": [
        {
          "id_contrato": 1042,
          "direccion": "Av. Corrientes 1234",
          "monto_bruto": 600000.00,
          "comision": 30000.00,
          "gastos": 0.00,
          "monto_neto": 570000.00
        }
      ]
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 1 }
}
```

#### `POST /api/v1/liquidaciones/{id}/aprobar`
Solo rol ADMIN (o EMPLEADO con permiso `CAN_APPROVE_LIQUIDATIONS` delegado).

**Flujo posterior a la aprobación:**
1. Estado: `PENDIENTE` → `APROBADA`.
2. Genera automáticamente registros de egreso en `transacciones` (tipo `EGRESO_LIQUIDACION`), reduciendo el balance de CAJA 1.
3. La liquidación queda en `APROBADA` hasta que la administradora confirme la transferencia bancaria.

#### `POST /api/v1/liquidaciones/{id}/confirmar-pago`
La administradora ejecuta este endpoint después de confirmar manualmente la transferencia en homebanking. Estado: `APROBADA` → `PAGADA`.

### 4.4 Endpoints de Consulta y Reportes

| Endpoint | Descripción |
|---|---|
| `GET /api/v1/contratos?estado={}&id_propietario={}&id_inquilino={}&page={}&limit={}` | Lista contratos con filtros opcionales y paginación |
| `GET /api/v1/inquilinos/{id}/saldo` | Balance consolidado del inquilino (suma de `periodos_pago` pendientes + punitorios) |
| `GET /api/v1/propietarios/{id}/resumen` | Dashboard del propietario: propiedades, contratos activos, liquidaciones recientes |
| `GET /api/v1/reportes/caja?tipo={TERCEROS\|OPERATIVA}&desde={DATE}&hasta={DATE}` | Flujo histórico y balance de cierre de la caja seleccionada en el rango provisto |
| `GET /api/v1/transacciones?id_contrato={}&desde={}&hasta={}&page={}&limit={}` | Consulta paginada del libro diario con filtros |

---

## 5. Máquinas de Estado

### 5.1 Estado del Contrato

```
BORRADOR ──► ACTIVO ──► VENCIDO
                │
                ├──► RESCINDIDO  (requiere balance en cero)
                │
                └──► MOROSO ──► ACTIVO  (automático al pagar)
```

| Transición | Disparador |
|---|---|
| BORRADOR → ACTIVO | Admin activa el contrato manualmente |
| ACTIVO → VENCIDO | `fecha_fin` superada (cron) |
| ACTIVO → RESCINDIDO | `PATCH /contratos/{id}/estado` con validación de balance cero |
| ACTIVO → MOROSO | Cron detecta ≥ 2 períodos en `VENCIDO_IMPAGO` |
| MOROSO → ACTIVO | `POST /pagos/registrar` reduce `VENCIDO_IMPAGO` a < 2 (automático) |

### 5.2 Estado del Período de Pago (`periodos_pago`)

```
CARGO_PENDIENTE ──► COBRADO_PARCIAL ──► COBRADO_TOTAL
        │
        └── (cron: fecha_vencimiento superada) ──► VENCIDO_IMPAGO
```

| Estado | Condición |
|---|---|
| `CARGO_PENDIENTE` | Período generado, sin pagos |
| `COBRADO_PARCIAL` | `monto_cobrado > 0` pero `< monto_cargo` |
| `COBRADO_TOTAL` | `monto_cobrado >= monto_cargo` (incluyendo punitorios saldados) |
| `VENCIDO_IMPAGO` | `fecha_vencimiento < hoy` y estado ≠ `COBRADO_TOTAL` (asignado por cron) |

### 5.3 Flujo Mensual Completo

```
Día 1 del mes
    │
    ▼
CARGO_PENDIENTE (cron genera el período)
    │
    ├── Inquilino paga parcial ──► COBRADO_PARCIAL
    │       │
    │       └── Inquilino completa el pago ──► COBRADO_TOTAL
    │
    ├── Inquilino paga total ──────────────► COBRADO_TOTAL
    │
    └── fecha_vencimiento superada ─────► VENCIDO_IMPAGO
                                              │
                                              └── Cron genera PUNITORIO_DIARIO en transacciones
```

### 5.4 Estado de la Liquidación

```
PENDIENTE ──► APROBADA ──► PAGADA
```

| Transición | Disparador |
|---|---|
| PENDIENTE → APROBADA | `POST /liquidaciones/{id}/aprobar` (ADMIN o delegado) |
| APROBADA → PAGADA | `POST /liquidaciones/{id}/confirmar-pago` (ADMIN) |

### 5.5 Estado del Depósito en Garantía (`depositos_garantia`)

```
RETENIDO ──► DEVUELTO_PARCIAL
    │
    ├──► DEVUELTO_TOTAL
    │
    └──► APLICADO_A_DEUDA
```

---

## 6. Roles y Permisos (RBAC)

### 6.1 Matriz de Permisos

| Acción | ADMIN | EMPLEADO | AUDITOR |
|---|:---:|:---:|:---:|
| Ver contratos, inquilinos, propietarios | ✓ | ✓ | ✓ (enmascarado) |
| Crear/editar contratos | ✓ | ✓ | ✗ |
| Registrar pagos | ✓ | ✓ | ✗ |
| Cargar gastos/arreglos | ✓ | ✓ | ✗ |
| Ver libro diario (transacciones) | ✓ | ✓ | ✓ (solo montos e IDs) |
| Aprobar liquidaciones | ✓ | Solo con delegación | ✗ |
| Confirmar pago de liquidación | ✓ | ✗ | ✗ |
| Generar contra-asientos | ✓ | ✗ | ✗ |
| Gestionar depósitos en garantía | ✓ | ✗ | ✗ |
| Gestionar usuarios y roles | ✓ | ✗ | ✗ |

### 6.2 Delegación Operativa

El Admin puede asignar temporalmente el permiso `CAN_APPROVE_LIQUIDATIONS` a un Empleado Senior para no bloquear operaciones durante ausencias. Esta delegación es:
- Explícita (requiere acción del Admin para otorgarla).
- Revocable en cualquier momento.
- Registrada en el sistema (auditable).

### 6.3 Data Masking para el Rol AUDITOR

El enmascaramiento se aplica **en la capa de serialización de la API** (Route Handlers de Next.js), no en la base de datos. El handler evalúa el rol del JWT y aplica transformaciones de strings antes de emitir la respuesta JSON:

| Campo | Visible para AUDITOR |
|---|---|
| `inquilinos.dni_cuit` | `"20-****-4"` |
| `inquilinos.email` | `"ga****@gmail.com"` |
| `inquilinos.telefono` | `"+54 9 11 ****-5678"` |
| `propietarios.cbu` | `"072****8901"` (primeros 3 y últimos 4) |
| `usuarios.auth_user_id` | Nunca expuesto; sólo vincula el perfil con Supabase Auth |

---

## 7. Seguridad Financiera y Casos Borde

### 7.1 Inmutabilidad del Libro Diario

La tabla `transacciones` **no admite DELETE ni UPDATE**. Esta restricción debe aplicarse:
- A nivel de permisos de base de datos (el usuario de la app no tiene `DELETE`/`UPDATE` sobre esta tabla).
- A nivel de ORM (ningún método de Prisma sobre `transacciones` ejecuta estas operaciones).

Los errores de carga se corrigen exclusivamente mediante **contra-asientos**:
- Solo el rol ADMIN puede generarlos.
- Se inserta una nueva fila con monto invertido y `id_txn_origen` apuntando a la transacción original.
- El campo `comentario` es obligatorio y no puede estar vacío.

### 7.2 Bloqueo de Concurrencia (Pessimistic Locking)

Para prevenir el doble gasto (ej: doble aprobación de liquidación), el backend utiliza transacciones de base de datos con `SELECT ... FOR UPDATE` en los recursos críticos:

```typescript
// Ejemplo conceptual con Prisma
await prisma.$transaction(async (tx) => {
  const liquidacion = await tx.$queryRaw`
    SELECT * FROM liquidaciones WHERE id = ${id} FOR UPDATE
  `;
  // ... lógica de aprobación
});
```

### 7.3 Prelación de Pagos (Orden de Imputación)

Cuando `POST /api/v1/pagos/registrar` recibe un monto, lo distribuye en este orden estricto:

**Paso 1 — Intereses punitorios:**
El sistema suma todas las transacciones de tipo `PUNITORIO_DIARIO` asociadas al contrato que no hayan sido saldadas. El pago se aplica primero a cancelar esta deuda total o parcialmente.

**Paso 2 — Capital base (alquiler):**
Solo si la deuda por punitorios quedó en cero, el saldo remanente del pago se aplica al `monto_cargo` de `periodos_pago`, comenzando **siempre por el período más antiguo** (`ORDER BY periodo ASC`).

### 7.4 Idempotencia en Registro de Pagos

Para prevenir duplicación por latencia o re-envío del formulario:

1. El frontend genera un UUID (`crypto.randomUUID()`) al cargar el formulario de pago.
2. Lo incluye como `idempotency_key` en el payload.
3. El backend verifica la existencia en `idempotency_keys` antes de procesar.
4. Si ya existe → responde HTTP 409 Conflict con la respuesta original cacheada.
5. Si no existe → procesa el pago y persiste la key con el status de respuesta.
6. El cron nocturno limpia keys con más de 24 horas de antigüedad.

### 7.5 Cálculo de Punitorios (Interés Moratorio)

**Fórmula diaria:**

```
Interés Diario = (monto_cargo − monto_cobrado) × (pct_punitorio_diario / 100)
```

**Valores:**
- `pct_punitorio_diario` por defecto: `0.1000` (0.1% diario ≈ 3% mensual acumulable).
- Configurable por contrato en el campo `pct_punitorio_diario`.

**Persistencia:** el cron genera una fila en `transacciones` por cada día de mora con `tipo = PUNITORIO_DIARIO` e `id_usuario_creador = NULL`. Esta es la fuente de verdad de la deuda por mora.

**Convención de auditoría:** `id_usuario_creador = NULL` significa inequívocamente "generado por el sistema". Ninguna fila humana puede tener NULL en este campo.

### 7.6 Arquitectura del Cron Job para Morosidad

**Opción Cloud (Vercel):**
- Ruta protegida: `POST /api/v1/cron/verificar-mora`
- Protección: header `Authorization: Bearer {CRON_SECRET}` verificado contra variable de entorno.
- Configurado en `vercel.json` con la expresión cron adecuada (ej: diaria a las 02:00 AM).

**Opción Self-Hosted (Docker / VPS):**
- Contenedor independiente con daemon cron que dispara un script Node.js por CLI.
- Alternativa: `node-cron` dentro de un servidor Express de soporte.

**Lógica del cron:**
1. Buscar todos los `periodos_pago` donde `fecha_vencimiento < hoy` y `estado != 'COBRADO_TOTAL'`.
2. Marcar cada período encontrado como `VENCIDO_IMPAGO`.
3. Calcular y persistir `PUNITORIO_DIARIO` en `transacciones` para cada período impago.
4. Contar períodos `VENCIDO_IMPAGO` por contrato. Si ≥ 2 → actualizar contrato a `MOROSO`.
5. Limpiar `idempotency_keys` con más de 24 horas de antigüedad.

---

## 8. Stack Técnico y Arquitectura

| Capa | Tecnología | Justificación |
|---|---|---|
| Framework | Next.js 14+ (App Router) | Full-stack en un único proyecto, Server Components, API Routes |
| Lenguaje | TypeScript | Tipado estricto crítico para lógica financiera |
| Base de datos | PostgreSQL | ACID compliance, `SELECT FOR UPDATE` para locking, robustez financiera |
| ORM | Prisma ORM | Migraciones versionadas, tipado end-to-end, transacciones seguras |
| Autenticación | Supabase Auth + `@supabase/ssr` | Sesiones por cookies y perfil/rol fresco en Prisma — ver sección 9 |

### 8.1 Estructura de Carpetas (App Router)

```
/app
  /api
    /v1
      /pagos
      /contratos
      /liquidaciones
      /gastos
      /reportes
      /transacciones
      /cron
        /verificar-mora
  /(dashboard)
    /contratos
    /liquidaciones
    /propietarios
    /reportes
/lib
  /db         → Cliente Prisma
  /supabase   → Clientes browser/server/admin y renovación de sesión
  /services   → Lógica de negocio (pagos, liquidaciones, etc.)
  /utils      → Helpers (masking, cálculos)
/prisma
  schema.prisma
  /migrations
```

---

## 9. Autenticación y Autorización

### 9.1 Estrategia: Supabase Auth y perfiles de dominio

Supabase Auth administra credenciales y sesiones. `public.usuarios.auth_user_id` vincula cada
identidad con su perfil de dominio, que conserva el rol y los permisos vigentes. El login usa
el cliente de navegador; Server Components y route handlers validan la identidad con el cliente
SSR y consultan el perfil fresco en Prisma. El proxy solo renueva cookies y bloquea identidad
ausente. Las invitaciones ADMIN usan `inviteUserByEmail` y el flujo `/auth/confirm` verifica el
token de invitación antes de permitir fijar la contraseña.

### 9.2 Autorización por route handler

Cada endpoint protegido llama `requireAuthenticatedUser`, `requireAdmin` o el helper de permiso
correspondiente antes de cualquier lectura o efecto. Cron conserva su autenticación independiente
con `CRON_SECRET`. Nunca se autoriza desde metadata editable del usuario ni desde el body.

---

## 10. Deployment y Secrets

### 10.1 Infraestructura

| Componente | Servicio |
|---|---|
| Frontend + API | Vercel |
| Base de datos + Auth + Realtime | Supabase |
| Cron jobs | Vercel Cron |

### 10.2 Migraciones en CI/CD

Las migraciones de Prisma se ejecutan automáticamente en el pipeline de deployment:
```bash
prisma migrate deploy
```
Nunca `prisma migrate dev` en producción.

### 10.3 Manejo de Secrets

**Regla:** ningún dato crítico en el repositorio de código. Nunca commitear `.env.production`.

Variables de entorno requeridas:

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Connection string de PostgreSQL |
| `APP_URL` | Origen HTTP/HTTPS de la aplicación para enlaces de invitación |
| `NEXT_PUBLIC_SUPABASE_URL` | URL pública del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key para clientes del navegador |
| `SUPABASE_SECRET_KEY` | Secret key server-only para operaciones Admin |
| `CRON_SECRET` | API key para autenticar las llamadas del cron job |

En Vercel: administradas desde el panel de Environment Variables.
En self-hosted: archivo `.env.production` fuera del repositorio, inyectado en el contenedor.

---

## 11. Referencia: ENUMs del Sistema

### `tipo_transaccion` (tabla `transacciones`)

| Valor | CAJA | Dirección | Descripción |
|---|---|---|---|
| `INGRESO_COBRO` | CAJA 1 | Entrada | Pago del inquilino. Base para cálculo de comisión. |
| `INGRESO_GARANTIA` | CAJA 1 | Entrada (pasivo) | Depósito en garantía al firmar. **No devenga comisión.** |
| `TRANSFERENCIA_INTERNA` | CAJA 1 → CAJA 2 | Movimiento interno | Comisión de administración o flujo completo de propiedad propia. |
| `EGRESO_LIQUIDACION` | CAJA 1 | Salida | Pago neto al propietario. Cierra el balance del período. |
| `EGRESO_TERCEROS` | CAJA 1 | Salida | Pago a consorcio (expensas) o a proveedor (arreglos). Separado de `EGRESO_LIQUIDACION` para claridad del auditor. |
| `EGRESO_GARANTIA` | CAJA 1 | Salida | Devolución del depósito al inquilino al finalizar el contrato. |
| `PUNITORIO_DIARIO` | CAJA 1 | Devengo | Interés moratorio diario generado por el cron. `id_usuario_creador = NULL`. **Clave para el algoritmo de prelación de pagos (Paso 1).** |
| `CONTRA_ASIENTO` | Cualquiera | Corrección | Anulación de error. Requiere `id_txn_origen` y `comentario` obligatorios. Solo ADMIN. |

### `estado_contrato` (tabla `contratos`)

| Valor | Descripción |
|---|---|
| `BORRADOR` | Contrato creado pero no activado |
| `ACTIVO` | Vigente y generando cargos mensuales |
| `MOROSO` | ≥ 2 períodos en `VENCIDO_IMPAGO`. Devengando punitorios. |
| `VENCIDO` | Fecha de fin superada sin rescisión formal |
| `RESCINDIDO` | Finalizado anticipadamente con balance en cero |

### `estado_periodo` (tabla `periodos_pago`)

| Valor | Descripción |
|---|---|
| `CARGO_PENDIENTE` | Período generado, sin cobros |
| `COBRADO_PARCIAL` | Pago parcial registrado. Saldo deudor activo. |
| `COBRADO_TOTAL` | Deuda del período completamente saldada |
| `VENCIDO_IMPAGO` | `fecha_vencimiento` superada sin pago total. Genera punitorios diarios. |

### `estado_liquidacion` (tabla `liquidaciones`)

| Valor | Descripción |
|---|---|
| `PENDIENTE` | Corrida generada, pendiente de aprobación |
| `APROBADA` | Aprobada por Admin. Fondos comprometidos en CAJA 1. |
| `PAGADA` | Transferencia bancaria confirmada por Admin. |

### `estado_deposito` (tabla `depositos_garantia`)

| Valor | Descripción |
|---|---|
| `RETENIDO` | Depósito en poder de la inmobiliaria durante la vigencia del contrato |
| `DEVUELTO_PARCIAL` | Se devolvió parte del depósito (daños descontados) |
| `DEVUELTO_TOTAL` | Depósito devuelto íntegramente al inquilino |
| `APLICADO_A_DEUDA` | Depósito utilizado para saldar deuda impaga del inquilino |

### `indice_actualizacion` (tabla `contratos`)

| Valor | Descripción |
|---|---|
| `ICL` | Índice de Contratos de Locación (BCRA) |
| `IPC` | Índice de Precios al Consumidor (INDEC) |
| `ACUERDO` | Porcentaje pactado libremente entre las partes |

---

*Documento generado el 2026-06-25. Toda modificación al modelo de datos debe reflejarse simultáneamente en este SDD y en el schema de Prisma.*
