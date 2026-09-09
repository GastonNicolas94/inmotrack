# Rutas API del Módulo Financiero — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exponer vía HTTP los servicios de negocio del módulo financiero ya implementados (Pagos, Gastos, Liquidaciones, Transacciones), para que la UI diseñada en el spec de UI tenga algo a lo que hacer `fetch`.

**Architecture:** Route Handlers finos (`app/api/v1/.../route.ts`) que validan el input con Zod, extraen la sesión con `auth()`, llaman al service correspondiente, y traducen el resultado/error a HTTP — sin lógica de negocio en la ruta. Los métodos de listado (`listar`/`listarRecientes`) son los únicos agregados nuevos a los services; el resto ya existe y está probado.

**Tech Stack:** Next.js 16 (App Router, Route Handlers), Auth.js (`@/lib/auth`), Zod, Prisma 7, `node:test` nativo para los tests de los nuevos métodos de servicio.

**Spec:** `docs/superpowers/specs/2026-08-22-ui-modulo-financiero-design.md` (qué necesita cada página) y `docs/superpowers/specs/2026-08-21-modelo-financiero-conciliacion-design.md` (servicios que este plan expone).

## Global Constraints

- Todo campo monetario que se serialice a JSON usa `.toString()` sobre el `Decimal` de Prisma (nunca `Number()` para aritmética — la aritmética ya ocurrió dentro de los services; acá solo se serializa).
- Tests: `import { describe, it, beforeEach } from "node:test"; import assert from "node:assert/strict";`. Correr con `node --import tsx --test <archivo>` o `npm test` para la suite completa (ya tiene `--test-concurrency=1`, no tocar).
- Los métodos de listado nuevos (`PagosService.listarRecientes`, `GastosService.listar`, `LiquidacionesService.listar`, `TransaccionesService.listar`) sí llevan test — son lógica de negocio nueva. Los Route Handlers en sí (`route.ts`) NO llevan test automatizado — es el mismo patrón que ya tienen todas las rutas existentes del proyecto (`app/api/v1/contratos/route.ts`, etc., ninguna tiene test dedicado). Se verifican manualmente con `curl` contra el servidor de dev, un comando por tarea, con el resultado esperado documentado.
- `middleware.ts` **no se toca en este plan** — ya tiene el RBAC resuelto (bloqueo de `AUDITOR` en métodos no-GET, `SOLO_ADMIN` para `confirmar-pago` y `contra-asiento`).
- Toda ruta `POST`/`PATCH` que llame a un service que necesita `id_usuario_creador` extrae la sesión con `const session = await auth();` (de `@/lib/auth`) y castea `Number(session.user.id)` — mismo patrón ya usado en `app/api/v1/usuarios/route.ts`.
- Nada de `git commit` salvo que el usuario lo pida explícitamente — los steps de "Commit" quedan en el plan para cuando se ejecuten manualmente, no asumir que corren solos.

**Fuera de alcance de este plan:** UI (componentes, páginas), motor de tiempo (cron), ajuste por inflación, gestión de delegación (`puede_aprobar_liquidaciones` ya tiene su endpoint en `app/api/v1/usuarios/route.ts`, preexistente, no se toca).

---

## File Structure

**Helper nuevo compartido:**
- Create: `lib/api-error-handler.ts` — traduce errores de negocio de los services a HTTP (`IdempotencyConflictError` → 409, `Prisma...P2025` → 404, `Error` genérico de negocio → 400, resto → 500).

**Servicios — métodos de listado nuevos:**
- Modify: `services/pagos.service.ts` — agrega `listarRecientes`
- Modify: `services/gastos.service.ts` — agrega `listar`
- Modify: `services/liquidaciones.service.ts` — agrega `listar`
- Modify: `services/transacciones.service.ts` (nuevo archivo, no existía como tal — el servicio ya tiene `crearContraAsiento`) — agrega `listar`

**Schemas nuevos:**
- Modify: `schemas/liquidacion.schema.ts` — agrega `generarLiquidacionSchema`
- Create: `schemas/transaccion.schema.ts` — `contraAsientoSchema`

**Rutas nuevas:**
- Create: `app/api/v1/pagos/route.ts` (GET, POST)
- Create: `app/api/v1/gastos/route.ts` (GET, POST)
- Create: `app/api/v1/gastos/[id]/marcar-pagado/route.ts` (PATCH)
- Create: `app/api/v1/liquidaciones/route.ts` (GET, POST)
- Create: `app/api/v1/liquidaciones/[id]/aprobar/route.ts` (POST)
- Create: `app/api/v1/liquidaciones/[id]/confirmar-pago/route.ts` (POST)
- Create: `app/api/v1/transacciones/route.ts` (GET)
- Create: `app/api/v1/transacciones/contra-asiento/route.ts` (POST)

---

### Task 1: Helper de errores + `PagosService.listarRecientes` + rutas de Pagos

**Files:**
- Create: `lib/api-error-handler.ts`
- Modify: `services/pagos.service.ts`
- Test: `tests/services/pagos.service.test.ts`
- Create: `app/api/v1/pagos/route.ts`

**Interfaces:**
- Produces: `handleServiceError(e: unknown): NextResponse` — reutilizado por todas las tareas siguientes.
- Produces: `PagosService.listarRecientes(limit?: number): Promise<Array<{ id, fecha, monto, contrato_id, inquilino, direccion, periodo }>>`

- [ ] **Step 1: Implementar `lib/api-error-handler.ts`**

```typescript
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { IdempotencyConflictError } from "@/lib/idempotency";
import { errorResponse } from "@/lib/errors";

/**
 * Traduce un error lanzado por la capa de servicio a una respuesta HTTP.
 * Los services lanzan `new Error("mensaje")` para violaciones de reglas de
 * negocio (ej. "Solo se pueden aprobar liquidaciones en estado PENDIENTE") —
 * esas se traducen a 400. Prisma `findUniqueOrThrow` sin resultado (P2025) a
 * 404. Idempotencia a 409. Cualquier otra cosa (bug real) a 500.
 */
export function handleServiceError(e: unknown): NextResponse {
  if (e instanceof IdempotencyConflictError) {
    return errorResponse("IDEMPOTENCY_CONFLICT", e.message, 409);
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
    return errorResponse("NOT_FOUND", "El recurso no existe.", 404);
  }
  if (e instanceof Error) {
    return errorResponse("BUSINESS_RULE_VIOLATION", e.message, 400);
  }
  return errorResponse("SERVER_ERROR", String(e), 500);
}
```

- [ ] **Step 2: Escribir el test de `listarRecientes` (falla primero)**

Agregar a `tests/services/pagos.service.test.ts`, dentro de un nuevo `describe`:

```typescript
describe("PagosService.listarRecientes", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("lista los pagos (aplicaciones de CAPITAL) ordenados por fecha descendente", async () => {
    const { contrato, periodo, usuario } = await crearEscenarioBasico();
    await prisma.periodoPago.update({
      where: { id: periodo.id },
      data: { punitorios_devengados: 0 },
    });

    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 30000,
      idempotency_key: "10101010-1010-1010-1010-101010101010",
      id_usuario_creador: usuario.id,
    });

    const listado = await PagosService.listarRecientes();

    assert.equal(listado.length, 1);
    assert.equal(Number(listado[0].monto), 30000);
    assert.equal(listado[0].contrato_id, contrato.id);
    assert.equal(listado[0].periodo, "2026-08");
  });
});
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `node --import tsx --test tests/services/pagos.service.test.ts`
Expected: FAIL — `PagosService.listarRecientes is not a function`.

- [ ] **Step 4: Implementar `listarRecientes` en `services/pagos.service.ts`**

Agregar al objeto `PagosService`:

```typescript
  async listarRecientes(limit = 50) {
    const aplicaciones = await prisma.aplicacionPago.findMany({
      where: { tipo_aplicacion: "CAPITAL" },
      include: {
        transaccion: true,
        periodo_pago: {
          include: {
            contrato: {
              include: { inquilino: true, propiedad: true },
            },
          },
        },
      },
      orderBy: { transaccion: { fecha_transaccion: "desc" } },
      take: limit,
    });

    return aplicaciones.map((a) => ({
      id: a.id,
      fecha: a.transaccion.fecha_transaccion,
      monto: a.monto_aplicado.toString(),
      contrato_id: a.periodo_pago?.id_contrato ?? null,
      inquilino: a.periodo_pago?.contrato.inquilino.nombre ?? null,
      direccion: a.periodo_pago?.contrato.propiedad.direccion ?? null,
      periodo: a.periodo_pago?.periodo ?? null,
    }));
  },
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `node --import tsx --test tests/services/pagos.service.test.ts`
Expected: PASS (todos los tests de este archivo, incluido el nuevo)

- [ ] **Step 6: Crear `app/api/v1/pagos/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { PagosService } from "@/services/pagos.service";
import { pagoSchema } from "@/schemas/pago.schema";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";
import { auth } from "@/lib/auth";

export async function GET() {
  try {
    const pagos = await PagosService.listarRecientes();
    return NextResponse.json(pagos);
  } catch (e) {
    return handleServiceError(e);
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return errorResponse("UNAUTHORIZED", "No autenticado.", 401);
  }

  const body = await req.json();
  const parsed = pagoSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Datos inválidos.", 400, {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const resultado = await PagosService.registrar({
      ...parsed.data,
      id_usuario_creador: Number(session.user.id),
    });
    return NextResponse.json(resultado, { status: 201 });
  } catch (e) {
    return handleServiceError(e);
  }
}
```

- [ ] **Step 7: Verificar manualmente contra el servidor de dev**

Con `npm run dev` corriendo y sesión iniciada (cookie de auth en el navegador o un token válido), y un `id_contrato` real de tu DB:

```bash
curl -X POST http://localhost:3000/api/v1/pagos \
  -H "Content-Type: application/json" \
  --cookie "<cookie de sesión copiada del navegador>" \
  -d '{"id_contrato": 1, "monto_pagado": 1000, "idempotency_key": "'$(node -e "console.log(crypto.randomUUID())")'"}'
```

Expected: `201` con el resultado de `PagosService.registrar` (`{ procesado: true, ... }`). Un segundo `curl` idéntico (misma `idempotency_key`) debe devolver `409` con `error_code: "IDEMPOTENCY_CONFLICT"`.

```bash
curl http://localhost:3000/api/v1/pagos --cookie "<cookie>"
```

Expected: `200` con un array de pagos recientes, incluyendo el que acabás de crear.

- [ ] **Step 8: Commit**

```bash
git add lib/api-error-handler.ts services/pagos.service.ts tests/services/pagos.service.test.ts app/api/v1/pagos/route.ts
git commit -m "feat(api): rutas de Pagos + PagosService.listarRecientes + helper de errores de API"
```

---

### Task 2: `GastosService.listar` + rutas de Gastos (listado y alta)

**Files:**
- Modify: `services/gastos.service.ts`
- Test: `tests/services/gastos.service.test.ts`
- Create: `app/api/v1/gastos/route.ts`

**Interfaces:**
- Consumes: `handleServiceError` (Task 1).
- Produces: `GastosService.listar(): Promise<Gasto[]>` (con `propiedad` y `contrato.inquilino` incluidos).

- [ ] **Step 1: Escribir el test (falla primero)**

Agregar a `tests/services/gastos.service.test.ts`:

```typescript
describe("GastosService.listar", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("lista gastos de propiedad y gastos propios de la inmobiliaria juntos", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle 1", es_propia: false },
    });

    await GastosService.crear({
      id_propiedad: propiedad.id,
      concepto: "Arreglo",
      monto: 10000,
      tipo: "ARREGLO",
      cargo_a: "PROPIETARIO",
    });
    await GastosService.crear({
      concepto: "Sueldo",
      monto: 500000,
      tipo: "OTRO",
      cargo_a: "INMOBILIARIA",
    });

    const gastos = await GastosService.listar();

    assert.equal(gastos.length, 2);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --import tsx --test tests/services/gastos.service.test.ts`
Expected: FAIL — `GastosService.listar is not a function`.

- [ ] **Step 3: Implementar `listar` en `services/gastos.service.ts`**

Agregar al objeto `GastosService`:

```typescript
  async listar() {
    return prisma.gasto.findMany({
      include: {
        propiedad: { select: { id: true, direccion: true } },
        contrato: { select: { id: true, inquilino: { select: { nombre: true } } } },
      },
      orderBy: { id: "desc" },
    });
  },
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --import tsx --test tests/services/gastos.service.test.ts`
Expected: PASS (todos los tests del archivo)

- [ ] **Step 5: Crear `app/api/v1/gastos/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { GastosService } from "@/services/gastos.service";
import { gastoSchema } from "@/schemas/gasto.schema";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";

export async function GET() {
  try {
    const gastos = await GastosService.listar();
    return NextResponse.json(gastos);
  } catch (e) {
    return handleServiceError(e);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = gastoSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Datos inválidos.", 400, {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const gasto = await GastosService.crear(parsed.data);
    return NextResponse.json(gasto, { status: 201 });
  } catch (e) {
    return handleServiceError(e);
  }
}
```

- [ ] **Step 6: Verificar manualmente**

```bash
curl -X POST http://localhost:3000/api/v1/gastos \
  -H "Content-Type: application/json" \
  --cookie "<cookie>" \
  -d '{"concepto": "Prueba", "monto": 5000, "tipo": "OTRO", "cargo_a": "INMOBILIARIA", "fecha_gasto": "2026-08-22"}'
```

Expected: `201` con el gasto creado (`id_propiedad: null`).

```bash
curl http://localhost:3000/api/v1/gastos --cookie "<cookie>"
```

Expected: `200` con un array que incluye el gasto recién creado.

- [ ] **Step 7: Commit**

```bash
git add services/gastos.service.ts tests/services/gastos.service.test.ts app/api/v1/gastos/route.ts
git commit -m "feat(api): rutas de Gastos (listado + alta) + GastosService.listar"
```

---

### Task 3: Ruta de marcar gasto como pagado

**Files:**
- Create: `app/api/v1/gastos/[id]/marcar-pagado/route.ts`

**Interfaces:**
- Consumes: `GastosService.marcarPagado(id, id_usuario_creador)` (ya existe, ya probado), `handleServiceError` (Task 1).

- [ ] **Step 1: Crear `app/api/v1/gastos/[id]/marcar-pagado/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { GastosService } from "@/services/gastos.service";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";
import { auth } from "@/lib/auth";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return errorResponse("UNAUTHORIZED", "No autenticado.", 401);
  }

  const { id } = await params;
  try {
    const gasto = await GastosService.marcarPagado(Number(id), Number(session.user.id));
    return NextResponse.json(gasto);
  } catch (e) {
    return handleServiceError(e);
  }
}
```

- [ ] **Step 2: Verificar manualmente**

Con un `id` de gasto real en estado `PENDIENTE`:

```bash
curl -X PATCH http://localhost:3000/api/v1/gastos/1/marcar-pagado --cookie "<cookie>"
```

Expected: `200` con `estado_pago: "PAGADO_PROVEEDOR"`. Repetir el mismo `curl` debe devolver `400` con `error_code: "BUSINESS_RULE_VIOLATION"` ("Este gasto ya fue marcado como pagado.").

- [ ] **Step 3: Commit**

```bash
git add app/api/v1/gastos/\[id\]/marcar-pagado/route.ts
git commit -m "feat(api): ruta para marcar un gasto como pagado al proveedor"
```

---

### Task 4: `LiquidacionesService.listar` + rutas de Liquidaciones (listado y generar)

**Files:**
- Modify: `services/liquidaciones.service.ts`
- Modify: `schemas/liquidacion.schema.ts`
- Test: `tests/services/liquidaciones.service.test.ts`
- Create: `app/api/v1/liquidaciones/route.ts`

**Interfaces:**
- Produces: `LiquidacionesService.listar(id_propietario?: number): Promise<Liquidacion[]>` (con `items` incluido).
- Produces: `schemas/liquidacion.schema.ts` exporta además `generarLiquidacionSchema` (Zod).

- [ ] **Step 1: Agregar `generarLiquidacionSchema` a `schemas/liquidacion.schema.ts`**

```typescript
import { z } from "zod";

export const generarLiquidacionSchema = z.object({
  id_propietario: z.number().int().positive(),
});
```

(Se agrega arriba del `export type LiquidacionResumen` que ya existe en el archivo — no lo reemplaza.)

- [ ] **Step 2: Escribir el test de `listar` (falla primero)**

Agregar a `tests/services/liquidaciones.service.test.ts`:

```typescript
describe("LiquidacionesService.listar", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("lista todas las liquidaciones, o solo las de un propietario si se filtra", async () => {
    const propietario1 = await prisma.propietario.create({
      data: { nombre: "Dueño 1", cbu: "0000000000000000000000" },
    });
    const propietario2 = await prisma.propietario.create({
      data: { nombre: "Dueño 2", cbu: "0000000000000000000000" },
    });
    await prisma.liquidacion.create({
      data: { id_propietario: propietario1.id, monto_bruto: 1000, retenciones: 0, monto_neto: 1000 },
    });
    await prisma.liquidacion.create({
      data: { id_propietario: propietario2.id, monto_bruto: 2000, retenciones: 0, monto_neto: 2000 },
    });

    const todas = await LiquidacionesService.listar();
    assert.equal(todas.length, 2);

    const filtradas = await LiquidacionesService.listar(propietario1.id);
    assert.equal(filtradas.length, 1);
    assert.equal(filtradas[0].id_propietario, propietario1.id);
  });
});
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `node --import tsx --test tests/services/liquidaciones.service.test.ts`
Expected: FAIL — `LiquidacionesService.listar is not a function`.

- [ ] **Step 4: Implementar `listar` en `services/liquidaciones.service.ts`**

Agregar al objeto `LiquidacionesService`:

```typescript
  async listar(id_propietario?: number) {
    return prisma.liquidacion.findMany({
      where: id_propietario ? { id_propietario } : undefined,
      include: { items: true, propietario: { select: { id: true, nombre: true } } },
      orderBy: { fecha_corrida: "desc" },
    });
  },
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `node --import tsx --test tests/services/liquidaciones.service.test.ts`
Expected: PASS (todos los tests del archivo)

- [ ] **Step 6: Crear `app/api/v1/liquidaciones/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { LiquidacionesService } from "@/services/liquidaciones.service";
import { generarLiquidacionSchema } from "@/schemas/liquidacion.schema";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";

export async function GET(req: NextRequest) {
  const idPropietario = req.nextUrl.searchParams.get("id_propietario");
  try {
    const liquidaciones = await LiquidacionesService.listar(
      idPropietario ? Number(idPropietario) : undefined
    );
    return NextResponse.json(liquidaciones);
  } catch (e) {
    return handleServiceError(e);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = generarLiquidacionSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Datos inválidos.", 400, {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const liquidacion = await LiquidacionesService.generarParaPropietario(
      parsed.data.id_propietario
    );
    return NextResponse.json(liquidacion, { status: 201 });
  } catch (e) {
    return handleServiceError(e);
  }
}
```

- [ ] **Step 7: Verificar manualmente**

```bash
curl -X POST http://localhost:3000/api/v1/liquidaciones \
  -H "Content-Type: application/json" \
  --cookie "<cookie>" \
  -d '{"id_propietario": 1}'
```

Expected: `201` con la liquidación generada (`estado: "PENDIENTE"`).

```bash
curl "http://localhost:3000/api/v1/liquidaciones?id_propietario=1" --cookie "<cookie>"
```

Expected: `200` con un array que incluye la liquidación recién generada.

- [ ] **Step 8: Commit**

```bash
git add services/liquidaciones.service.ts schemas/liquidacion.schema.ts tests/services/liquidaciones.service.test.ts app/api/v1/liquidaciones/route.ts
git commit -m "feat(api): rutas de Liquidaciones (listado + generar) + LiquidacionesService.listar"
```

---

### Task 5: Ruta de aprobar liquidación (RBAC con delegación)

**Files:**
- Create: `app/api/v1/liquidaciones/[id]/aprobar/route.ts`

**Interfaces:**
- Consumes: `LiquidacionesService.aprobar(id, id_usuario_creador)` (ya existe, ya probado), `handleServiceError` (Task 1).

Esta ruta valida un permiso que `middleware.ts` no puede resolver (requiere consultar `Usuario.puede_aprobar_liquidaciones` en la DB) — la validación va dentro del handler, no en el middleware.

- [ ] **Step 1: Crear `app/api/v1/liquidaciones/[id]/aprobar/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { LiquidacionesService } from "@/services/liquidaciones.service";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";
import { auth } from "@/lib/auth";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return errorResponse("UNAUTHORIZED", "No autenticado.", 401);
  }

  const userId = Number(session.user.id);
  const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id: userId } });

  const puedeAprobar = usuario.rol === "ADMIN" || usuario.puede_aprobar_liquidaciones;
  if (!puedeAprobar) {
    return errorResponse("FORBIDDEN", "No tenés permiso para aprobar liquidaciones.", 403);
  }

  const { id } = await params;
  try {
    const liquidacion = await LiquidacionesService.aprobar(Number(id), userId);
    return NextResponse.json(liquidacion);
  } catch (e) {
    return handleServiceError(e);
  }
}
```

- [ ] **Step 2: Verificar manualmente**

Con una liquidación en estado `PENDIENTE` y una sesión de un usuario con `rol = "EMPLEADO"` y `puede_aprobar_liquidaciones = false`:

```bash
curl -X POST http://localhost:3000/api/v1/liquidaciones/1/aprobar --cookie "<cookie de empleado sin delegación>"
```

Expected: `403` con `error_code: "FORBIDDEN"`.

Con sesión de `ADMIN`:

```bash
curl -X POST http://localhost:3000/api/v1/liquidaciones/1/aprobar --cookie "<cookie de admin>"
```

Expected: `200` con `estado: "APROBADA"`.

- [ ] **Step 3: Commit**

```bash
git add app/api/v1/liquidaciones/\[id\]/aprobar/route.ts
git commit -m "feat(api): ruta para aprobar liquidación, con chequeo de delegación"
```

---

### Task 6: Ruta de confirmar pago de liquidación

**Files:**
- Create: `app/api/v1/liquidaciones/[id]/confirmar-pago/route.ts`

**Interfaces:**
- Consumes: `LiquidacionesService.confirmarPago(id)` (ya existe, ya probado), `handleServiceError` (Task 1). Ya protegida `SOLO_ADMIN` por `middleware.ts` — no repetir el chequeo de rol acá.

- [ ] **Step 1: Crear `app/api/v1/liquidaciones/[id]/confirmar-pago/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { LiquidacionesService } from "@/services/liquidaciones.service";
import { handleServiceError } from "@/lib/api-error-handler";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const liquidacion = await LiquidacionesService.confirmarPago(Number(id));
    return NextResponse.json(liquidacion);
  } catch (e) {
    return handleServiceError(e);
  }
}
```

- [ ] **Step 2: Verificar manualmente**

Con una liquidación en estado `APROBADA`:

```bash
curl -X POST http://localhost:3000/api/v1/liquidaciones/1/confirmar-pago --cookie "<cookie de admin>"
```

Expected: `200` con `estado: "PAGADA"`. Con sesión de un usuario `EMPLEADO` (no `ADMIN`), el mismo `curl` debe devolver `403` — lo bloquea `middleware.ts`, no esta ruta.

- [ ] **Step 3: Commit**

```bash
git add app/api/v1/liquidaciones/\[id\]/confirmar-pago/route.ts
git commit -m "feat(api): ruta para confirmar el pago de una liquidación aprobada"
```

---

### Task 7: `TransaccionesService.listar` + ruta del Libro Diario

**Files:**
- Modify: `services/transacciones.service.ts`
- Test: `tests/services/transacciones.service.test.ts`
- Create: `app/api/v1/transacciones/route.ts`

**Interfaces:**
- Produces: `TransaccionesService.listar(filtros?: { tipo?, caja_destino?, id_contrato?, desde?, hasta? }): Promise<Transaccion[]>`

- [ ] **Step 1: Escribir el test (falla primero)**

Agregar a `tests/services/transacciones.service.test.ts`:

```typescript
describe("TransaccionesService.listar", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("filtra por tipo y por rango de fechas", async () => {
    await prisma.transaccion.create({
      data: {
        tipo: "INGRESO_COBRO",
        caja_destino: "TERCEROS",
        monto: 1000,
        fecha_transaccion: new Date("2026-01-01"),
      },
    });
    await prisma.transaccion.create({
      data: {
        tipo: "EGRESO_OPERATIVO",
        caja_destino: "OPERATIVA",
        monto: -500,
        fecha_transaccion: new Date("2026-06-01"),
      },
    });

    const soloIngresos = await TransaccionesService.listar({ tipo: "INGRESO_COBRO" });
    assert.equal(soloIngresos.length, 1);

    const enRango = await TransaccionesService.listar({
      desde: new Date("2026-05-01"),
      hasta: new Date("2026-07-01"),
    });
    assert.equal(enRango.length, 1);
    assert.equal(enRango[0].tipo, "EGRESO_OPERATIVO");
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --import tsx --test tests/services/transacciones.service.test.ts`
Expected: FAIL — `TransaccionesService.listar is not a function`.

- [ ] **Step 3: Implementar `listar` en `services/transacciones.service.ts`**

Agregar al objeto `TransaccionesService`:

```typescript
  async listar(filtros?: {
    tipo?: string;
    caja_destino?: string;
    id_contrato?: number;
    desde?: Date;
    hasta?: Date;
  }) {
    return prisma.transaccion.findMany({
      where: {
        ...(filtros?.tipo ? { tipo: filtros.tipo as never } : {}),
        ...(filtros?.caja_destino ? { caja_destino: filtros.caja_destino as never } : {}),
        ...(filtros?.id_contrato ? { id_contrato: filtros.id_contrato } : {}),
        ...(filtros?.desde || filtros?.hasta
          ? {
              fecha_transaccion: {
                ...(filtros.desde ? { gte: filtros.desde } : {}),
                ...(filtros.hasta ? { lte: filtros.hasta } : {}),
              },
            }
          : {}),
      },
      include: { usuario_creador: { select: { id: true, email: true } } },
      orderBy: { fecha_transaccion: "desc" },
    });
  },
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --import tsx --test tests/services/transacciones.service.test.ts`
Expected: PASS (todos los tests del archivo)

- [ ] **Step 5: Crear `app/api/v1/transacciones/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { TransaccionesService } from "@/services/transacciones.service";
import { handleServiceError } from "@/lib/api-error-handler";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  try {
    const transacciones = await TransaccionesService.listar({
      tipo: searchParams.get("tipo") ?? undefined,
      caja_destino: searchParams.get("caja") ?? undefined,
      id_contrato: searchParams.get("id_contrato")
        ? Number(searchParams.get("id_contrato"))
        : undefined,
      desde: searchParams.get("desde") ? new Date(searchParams.get("desde")!) : undefined,
      hasta: searchParams.get("hasta") ? new Date(searchParams.get("hasta")!) : undefined,
    });
    return NextResponse.json(transacciones);
  } catch (e) {
    return handleServiceError(e);
  }
}
```

- [ ] **Step 6: Verificar manualmente**

```bash
curl "http://localhost:3000/api/v1/transacciones?tipo=INGRESO_COBRO" --cookie "<cookie>"
```

Expected: `200` con un array filtrado solo por `tipo = INGRESO_COBRO`.

```bash
curl "http://localhost:3000/api/v1/transacciones?desde=2026-01-01&hasta=2026-12-31" --cookie "<cookie de AUDITOR>"
```

Expected: `200` (GET siempre permitido para `AUDITOR`, según `middleware.ts`).

- [ ] **Step 7: Commit**

```bash
git add services/transacciones.service.ts tests/services/transacciones.service.test.ts app/api/v1/transacciones/route.ts
git commit -m "feat(api): ruta del Libro Diario con filtros + TransaccionesService.listar"
```

---

### Task 8: Ruta de contra-asiento

**Files:**
- Create: `schemas/transaccion.schema.ts`
- Create: `app/api/v1/transacciones/contra-asiento/route.ts`

**Interfaces:**
- Consumes: `TransaccionesService.crearContraAsiento({ id_txn_origen, comentario, id_usuario_creador })` (ya existe, ya probado), `handleServiceError` (Task 1). Ya protegida `SOLO_ADMIN` por `middleware.ts`.

- [ ] **Step 1: Crear `schemas/transaccion.schema.ts`**

```typescript
import { z } from "zod";

export const contraAsientoSchema = z.object({
  id_txn_origen: z.number().int().positive(),
  comentario: z.string().min(1, "El comentario es obligatorio."),
});

export type ContraAsientoInput = z.infer<typeof contraAsientoSchema>;
```

- [ ] **Step 2: Crear `app/api/v1/transacciones/contra-asiento/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { TransaccionesService } from "@/services/transacciones.service";
import { contraAsientoSchema } from "@/schemas/transaccion.schema";
import { errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/api-error-handler";
import { auth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return errorResponse("UNAUTHORIZED", "No autenticado.", 401);
  }

  const body = await req.json();
  const parsed = contraAsientoSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Datos inválidos.", 400, {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const contraAsiento = await TransaccionesService.crearContraAsiento({
      ...parsed.data,
      id_usuario_creador: Number(session.user.id),
    });
    return NextResponse.json(contraAsiento, { status: 201 });
  } catch (e) {
    return handleServiceError(e);
  }
}
```

- [ ] **Step 3: Verificar manualmente**

Con el `id` de una transacción real:

```bash
curl -X POST http://localhost:3000/api/v1/transacciones/contra-asiento \
  -H "Content-Type: application/json" \
  --cookie "<cookie de admin>" \
  -d '{"id_txn_origen": 1, "comentario": "Prueba de contra-asiento"}'
```

Expected: `201` con `tipo: "CONTRA_ASIENTO"` y `monto` invertido respecto al original. Con sesión de `EMPLEADO`, el mismo `curl` debe devolver `403` — lo bloquea `middleware.ts`.

- [ ] **Step 4: Correr la suite completa de tests**

Run: `npm test`
Expected: todos los tests de este plan + los del plan de backend anterior, todos en PASS.

- [ ] **Step 5: Commit**

```bash
git add schemas/transaccion.schema.ts app/api/v1/transacciones/contra-asiento/route.ts
git commit -m "feat(api): ruta de contra-asiento del libro diario"
```

---

## Self-Review

**1. Cobertura del spec de UI:**
- `/pagos` (listado + alta) → Task 1.
- `/gastos` (listado + alta, marcar pagado) → Tasks 2 y 3.
- `/liquidaciones` (listado, generar, aprobar, confirmar) → Tasks 4, 5, 6.
- `/transacciones` (Libro Diario con filtros, contra-asiento) → Tasks 7 y 8.
- RBAC de la sección 4 del spec de UI: `AUDITOR` solo lectura → ya resuelto por `middleware.ts`, no se repite en ninguna ruta. `Aprobar liquidación` con delegación → Task 5. `Confirmar pago` y `contra-asiento` solo ADMIN → ya resuelto por `middleware.ts` (`SOLO_ADMIN`), Tasks 6 y 8 no repiten el chequeo.

**2. Placeholder scan:** ninguna referencia a "TBD" — cada step de verificación manual trae el comando `curl` completo y el resultado esperado, no "probar la ruta".

**3. Consistencia de tipos:** `handleServiceError` (Task 1) se importa igual en las 7 rutas siguientes, misma firma. Los 4 métodos `listar`/`listarRecientes` nuevos siguen el mismo patrón (objeto de filtros opcional, `include` de las relaciones que la UI necesita, `orderBy` descendente por fecha/id). `auth()` se usa igual en cada ruta que necesita `id_usuario_creador` (`Number(session.user.id)`), consistente con el patrón ya existente en `app/api/v1/usuarios/route.ts`.

**4. Nota de alcance:** el paginado real (`page`/`limit` en query params) que mencionaba el SDD original no se implementó — los 4 listados nuevos devuelven todo con un `take` fijo (`listarRecientes`) o sin límite (`gastos`, `liquidaciones`, `transacciones`). Es aceptable para el volumen actual del proyecto; si la cartera crece, es un ajuste futuro acotado a esos 4 métodos, no un cambio de diseño.

---

Plan completo y guardado en `docs/superpowers/plans/2026-08-22-rutas-api-modulo-financiero.md`. Dos opciones de ejecución:

**1. Subagent-Driven (recomendado)** — despliego un subagente fresco por tarea, con revisión entre tareas, iteración rápida.

**2. Ejecución Inline** — ejecuto las tareas en esta sesión con executing-plans, por lotes con checkpoints de revisión.

¿Cuál preferís?
