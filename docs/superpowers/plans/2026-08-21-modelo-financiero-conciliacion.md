# Modelo Financiero de Conciliación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el motor financiero de InmoTrack (pagos, gastos, liquidaciones, contra-asientos) sobre el modelo de conciliación basado en `AplicacionPago`, tal como quedó definido en el spec.

**Architecture:** Capa de servicio (`services/*.service.ts`) que opera exclusivamente vía `prisma.$transaction`. `AplicacionPago` es la fuente de verdad de todo cobro; `PeriodoPago.monto_cobrado/estado/punitorios_cobrados` son proyecciones cacheadas actualizadas dentro de la misma transacción que crea la aplicación. `Transaccion` es el libro diario inmutable (sin `UPDATE`/`DELETE` a nivel de permisos de DB).

**Tech Stack:** Next.js 16, TypeScript, Prisma 7 (`@prisma/adapter-pg`), PostgreSQL, test runner nativo de Node (`node:test` + `node:assert/strict`, ejecutado vía `tsx` que ya está en el proyecto — sin instalar ningún paquete de testing nuevo).

**Spec:** `docs/superpowers/specs/2026-08-21-modelo-financiero-conciliacion-design.md`

## Global Constraints

- Todo campo monetario usa `Decimal` de Prisma (`import { Decimal } from "@prisma/client"`) para las operaciones aritméticas — nunca `Number()` para sumar/restar dinero, por precisión.
- Toda escritura multi-tabla va dentro de `prisma.$transaction(async (tx) => {...})`.
- `Transaccion` nunca se actualiza ni se borra desde código de aplicación — solo `create`.
- `AplicacionPago`: exactamente uno de `id_periodo_pago` / `id_gasto` (nunca ambos, nunca ninguno) — válido en el service antes de cualquier `create`.
- `Gasto`: si `id_propiedad` es `null`, `cargo_a` debe ser `INMOBILIARIA` — válido en el service.
- `AplicacionPago` con `tipo_aplicacion = GASTO` nunca lleva `id_liquidacion`.
- Punitorios cobrados: 100% a `INGRESO_PUNITORIO`, sin comisión.
- Comisión (`INGRESO_COMISION` / `INGRESO_ALQUILER_PROPIO`): se genera en el mismo instante que la `AplicacionPago` de tipo `CAPITAL` que la origina.
- `Transaccion.id_usuario_creador = null` significa exclusivamente "generado por un proceso automático" — nunca lo asigna una fila creada por un humano.
- Toda operación que lea filas para decidir si crearlas/sellarlas (evitar double-counting) las lockea primero con `SELECT ... FOR UPDATE` dentro de la misma transacción — no alcanza con la atomicidad de `$transaction` sola. Aplica a `PagosService.registrar` (períodos del contrato, ya resuelto en Task 5), `LiquidacionesService.generarParaPropietario` (aplicaciones/gastos a sellar, Task 9) y `LiquidacionesService.aprobar` (la fila de la liquidación, Task 10).
- Tests: `import { describe, it, beforeEach } from "node:test"; import assert from "node:assert/strict";` — nunca `vitest`, nunca `jest`. Se ejecutan con `node --import tsx --test <archivo>` para un archivo suelto. Para la suite completa, siempre `npm test` (nunca armar el comando `find`/`node --test` a mano) — el script ya incluye `--test-concurrency=1`, necesario porque todos los archivos comparten la misma DB vía `cleanDatabase()`.
- `Decimal` se importa de `@prisma/client` directo — `@prisma/client/runtime/library` no existe como subpath en esta versión de Prisma 7.

**Fuera de alcance de este plan:** rutas API (`app/api/v1/...`), UI, y el mecanismo de actualización de `punitorios_devengados` (cron/job). Este plan cubre schema, migración, y la capa de servicio (`services/*.service.ts`) que esas rutas van a consumir después.

---

## File Structure

**Testing (nuevo, no existía — sin dependencias nuevas):**
- Create: `tests/helpers/db.ts` — limpieza de tablas entre tests
- Modify: `package.json` — agrega script `test` (usa `tsx`, ya instalado)

**Prisma:**
- Modify: `prisma/schema.prisma` — agrega campos de `PeriodoPago`, modelos `Gasto`/`Transaccion`/`AplicacionPago`/`Liquidacion`/`LiquidacionItem`/`IdempotencyKey`, enums nuevos/ampliados
- Create: 2 migraciones (`add_financial_module`, `add_financial_constraints`)

**Idempotencia:**
- Create: `lib/idempotency.ts`
- Test: `tests/lib/idempotency.test.ts`

**Servicios nuevos:**
- Create: `services/pagos.service.ts`
- Test: `tests/services/pagos.service.test.ts`
- Create: `services/gastos.service.ts`
- Test: `tests/services/gastos.service.test.ts`
- Create: `services/liquidaciones.service.ts`
- Test: `tests/services/liquidaciones.service.test.ts`
- Create: `services/transacciones.service.ts`
- Test: `tests/services/transacciones.service.test.ts`

**Schemas Zod nuevos:**
- Create: `schemas/pago.schema.ts`
- Create: `schemas/gasto.schema.ts`
- Create: `schemas/liquidacion.schema.ts`

**Servicios existentes a ajustar:**
- Modify: `services/inquilinos.service.ts` — `obtenerSaldo` incorpora punitorios y gastos a cargo del inquilino
- Modify: `services/contratos.service.ts` — `obtenerPorId` reincorpora `gastos` pendientes en el include

---

### Task 1: Setup de testing con el test runner nativo de Node

**Files:**
- Modify: `package.json`
- Create: `tests/helpers/db.ts`
- Test: `tests/helpers/db.test.ts`

**Interfaces:**
- Produces: `cleanDatabase(): Promise<void>` — trunca todas las tablas del módulo financiero + entidades de negocio, para dejar la DB en blanco entre tests. Todos los tests de tareas posteriores lo usan en `beforeEach`.

- [ ] **Step 1: Agregar el script de test a `package.json`**

`tsx` ya está en `devDependencies` — no hace falta instalar nada. En la sección `"scripts"` de `package.json`, agregar:

```json
"test": "find tests -name '*.test.ts' -exec node --import tsx --test --test-concurrency=1 {} +"
```

`find ... -exec ... {} +` agrupa todos los archivos `*.test.ts` encontrados en una sola invocación de `node --test`, sin depender de expansión de glob del shell (portable entre bash/zsh/sh). `--test-concurrency=1` es obligatorio: por defecto `node --test` corre archivos distintos en paralelo, y como todos comparten la misma base de datos con `cleanDatabase()` (`TRUNCATE` global) en cada `beforeEach`, correr dos archivos a la vez produce FK violations reales (un archivo trunca mientras otro tiene datos a medio crear). Confirmado corriendo la suite completa — sin este flag, tests que pasan en solitario fallan en conjunto.

- [ ] **Step 2: Escribir el test de `cleanDatabase` (falla primero, la función no existe)**

Crear `tests/helpers/db.test.ts`:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "./db";

describe("cleanDatabase", () => {
  it("deja la tabla de propietarios en cero después de crear una fila", async () => {
    await cleanDatabase();
    await prisma.propietario.create({
      data: { nombre: "Test", cbu: "0000000000000000000000" },
    });
    await cleanDatabase();
    const count = await prisma.propietario.count();
    assert.equal(count, 0);
  });
});
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `node --import tsx --test tests/helpers/db.test.ts`
Expected: FAIL — `Cannot find module './db'` o `cleanDatabase is not a function` (el archivo `tests/helpers/db.ts` no existe todavía).

- [ ] **Step 4: Implementar `cleanDatabase`**

Crear `tests/helpers/db.ts`:

```typescript
import { prisma } from "@/lib/db";

/**
 * Trunca todas las tablas del dominio de negocio y financiero, en cascada,
 * y resetea los contadores de autoincrement. Solo para uso en tests —
 * nunca importar este archivo desde código de producción.
 */
export async function cleanDatabase() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      aplicaciones_pago,
      liquidaciones_items,
      liquidaciones,
      transacciones,
      gastos,
      idempotency_keys,
      periodos_pago,
      contratos,
      inquilinos,
      propiedades,
      propietarios,
      usuarios
    RESTART IDENTITY CASCADE
  `);
}
```

**Nota de secuencia:** este `TRUNCATE` incluye tablas (`aplicaciones_pago`, `gastos`, `liquidaciones`, `liquidaciones_items`, `idempotency_keys`, `transacciones`) que recién crea Task 2. Correr Task 2 (schema + migración) antes de este Step 5, o el `TRUNCATE` falla con `relation does not exist`.

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `node --import tsx --test tests/helpers/db.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add package.json tests/helpers/db.ts tests/helpers/db.test.ts
git commit -m "test: setup de testing con node:test + helper de limpieza de DB entre tests"
```

---

### Task 2: Ampliar `prisma/schema.prisma` con el modelo financiero

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migración `prisma/migrations/<timestamp>_add_financial_module/migration.sql`

**Interfaces:**
- Produces: modelos `Gasto`, `Transaccion`, `AplicacionPago`, `Liquidacion`, `LiquidacionItem`, `IdempotencyKey`; enums `TipoTransaccion`, `CajaDestino`, `TipoAplicacion`, `CargoA`, `TipoGasto`, `EstadoGasto`, `EstadoLiquidacion`; campos nuevos en `PeriodoPago` (`punitorios_devengados`, `punitorios_cobrados`).

- [ ] **Step 1: Editar `PeriodoPago` en `prisma/schema.prisma`**

Reemplazar el modelo actual (líneas 82-94) por:

```prisma
model PeriodoPago {
  id                    Int           @id @default(autoincrement())
  id_contrato           Int
  contrato              Contrato      @relation(fields: [id_contrato], references: [id])
  periodo               String        @db.VarChar(7)
  monto_cargo           Decimal       @db.Decimal(15, 2)
  monto_cobrado         Decimal       @default(0.00) @db.Decimal(15, 2)
  punitorios_devengados Decimal       @default(0.00) @db.Decimal(15, 2)
  punitorios_cobrados   Decimal       @default(0.00) @db.Decimal(15, 2)
  estado                EstadoPeriodo @default(CARGO_PENDIENTE)
  fecha_vencimiento     DateTime      @db.Date

  aplicaciones AplicacionPago[]

  @@unique([id_contrato, periodo])
  @@map("periodos_pago")
}
```

- [ ] **Step 2: Agregar `Gasto`, `Transaccion`, `AplicacionPago`, `Liquidacion`, `LiquidacionItem`, `IdempotencyKey` al final del archivo, antes de la sección de ENUMs**

```prisma
// ─── Entidades Operativas ────────────────────────────────────────────────────

model Gasto {
  id                Int         @id @default(autoincrement())
  id_propiedad      Int?
  id_contrato       Int?
  id_liquidacion    Int?
  concepto          String
  categoria_interno String?
  monto             Decimal     @db.Decimal(15, 2)
  tipo              TipoGasto   @default(ARREGLO)
  cargo_a           CargoA      @default(PROPIETARIO)
  estado_pago       EstadoGasto @default(PENDIENTE)

  propiedad    Propiedad?       @relation(fields: [id_propiedad], references: [id])
  contrato     Contrato?        @relation(fields: [id_contrato], references: [id])
  liquidacion  Liquidacion?     @relation(fields: [id_liquidacion], references: [id])
  aplicaciones AplicacionPago[]

  @@map("gastos")
}

model Transaccion {
  id                 Int             @id @default(autoincrement())
  tipo               TipoTransaccion
  caja_destino       CajaDestino
  monto              Decimal         @db.Decimal(15, 2)
  fecha_transaccion  DateTime        @default(now())
  id_contrato        Int?
  contrato           Contrato?       @relation(fields: [id_contrato], references: [id])
  id_usuario_creador Int?
  usuario_creador    Usuario?        @relation("UsuarioCreador", fields: [id_usuario_creador], references: [id])
  id_txn_origen      Int?
  txn_origen         Transaccion?    @relation("ContraAsiento", fields: [id_txn_origen], references: [id])
  contra_asientos    Transaccion[]   @relation("ContraAsiento")
  comentario         String?
  aplicaciones       AplicacionPago[]

  @@map("transacciones")
}

model AplicacionPago {
  id              Int            @id @default(autoincrement())
  id_transaccion  Int
  id_periodo_pago Int?
  id_gasto        Int?
  id_liquidacion  Int?
  tipo_aplicacion TipoAplicacion
  monto_aplicado  Decimal        @db.Decimal(15, 2)

  transaccion  Transaccion  @relation(fields: [id_transaccion], references: [id])
  periodo_pago PeriodoPago? @relation(fields: [id_periodo_pago], references: [id])
  gasto        Gasto?       @relation(fields: [id_gasto], references: [id])
  liquidacion  Liquidacion? @relation(fields: [id_liquidacion], references: [id])

  @@map("aplicaciones_pago")
}

model Liquidacion {
  id             Int               @id @default(autoincrement())
  id_propietario Int
  propietario    Propietario       @relation(fields: [id_propietario], references: [id])
  fecha_corrida  DateTime          @default(now())
  monto_bruto    Decimal           @db.Decimal(15, 2)
  retenciones    Decimal           @db.Decimal(15, 2)
  monto_neto     Decimal           @db.Decimal(15, 2)
  estado         EstadoLiquidacion @default(PENDIENTE)

  items        LiquidacionItem[]
  aplicaciones AplicacionPago[]
  gastos       Gasto[]

  @@map("liquidaciones")
}

model LiquidacionItem {
  id             Int         @id @default(autoincrement())
  id_liquidacion Int
  liquidacion    Liquidacion @relation(fields: [id_liquidacion], references: [id], onDelete: Cascade)
  id_contrato    Int
  contrato       Contrato    @relation(fields: [id_contrato], references: [id])
  monto_bruto    Decimal     @db.Decimal(15, 2)
  comision       Decimal     @db.Decimal(15, 2)
  gastos         Decimal     @db.Decimal(15, 2)
  monto_neto     Decimal     @db.Decimal(15, 2)

  @@map("liquidaciones_items")
}

model IdempotencyKey {
  key             String   @id @db.VarChar(36)
  created_at      DateTime @default(now())
  response_status Int

  @@map("idempotency_keys")
}
```

- [ ] **Step 3: Agregar los campos de relación inversa que faltan en modelos ya existentes**

En `model Usuario`, agregar antes del `@@map`:
```prisma
  transacciones Transaccion[] @relation("UsuarioCreador")
```

En `model Propietario`, agregar antes del `@@map`:
```prisma
  liquidaciones Liquidacion[]
```

En `model Propiedad`, agregar antes del `@@map`:
```prisma
  gastos Gasto[]
```

En `model Contrato`, agregar antes del `@@map` (junto a `periodos_pago`), incluyendo el campo de ajuste por inflación (sección 3.1 del spec):
```prisma
  fecha_ultimo_ajuste DateTime? @db.Date
  gastos              Gasto[]
  transacciones       Transaccion[]
  liquidacion_items   LiquidacionItem[]
```

- [ ] **Step 4: Agregar los enums nuevos y ampliar los existentes, al final del archivo**

```prisma
enum TipoTransaccion {
  INGRESO_COBRO
  INGRESO_COMISION
  INGRESO_PUNITORIO
  INGRESO_ALQUILER_PROPIO
  EGRESO_LIQUIDACION
  EGRESO_TERCEROS
  EGRESO_OPERATIVO
  CONTRA_ASIENTO
}

enum CajaDestino {
  TERCEROS
  OPERATIVA
}

enum TipoAplicacion {
  CAPITAL
  PUNITORIO
  GASTO
}

enum CargoA {
  INQUILINO
  PROPIETARIO
  INMOBILIARIA
}

enum TipoGasto {
  ARREGLO
  EXPENSA
  GAS
  LUZ
  IMPUESTO
  OTRO
}

enum EstadoGasto {
  PENDIENTE
  PAGADO_PROVEEDOR
}

enum EstadoLiquidacion {
  PENDIENTE
  APROBADA
  PAGADA
}
```

- [ ] **Step 5: Validar el schema**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 6: Generar la migración (modo no interactivo — `prisma migrate dev` falla en este entorno)**

```bash
cd /Users/gfrancone/personal/InmoTrack
npx prisma migrate diff \
  --from-config-datasource prisma.config.ts \
  --to-schema prisma/schema.prisma \
  --script > /tmp/inmotrack_add_financial.sql

TS=$(date +%Y%m%d%H%M%S)
DIR="prisma/migrations/${TS}_add_financial_module"
mkdir -p "$DIR"
cp /tmp/inmotrack_add_financial.sql "$DIR/migration.sql"

psql "postgresql://gfrancone@localhost:5432/inmotrack" -f "$DIR/migration.sql"
npx prisma migrate resolve --applied "${TS}_add_financial_module"
```

Expected: el `psql` corre sin errores (`CREATE TABLE`, `CREATE TYPE`, `ALTER TABLE`), y `prisma migrate resolve` responde `marked as applied`.

- [ ] **Step 7: Verificar el estado de las migraciones y regenerar el cliente**

```bash
npx prisma migrate status
npx prisma generate
```

Expected: `Database schema is up to date!` y `Generated Prisma Client`.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): agrega modelo financiero (Gasto, Transaccion, AplicacionPago, Liquidacion, IdempotencyKey)"
```

---

### Task 3: Constraints de integridad y bloqueo de inmutabilidad en `transacciones`

**Files:**
- Create: migración `prisma/migrations/<timestamp>_add_financial_constraints/migration.sql`
- Test: `tests/db/constraints.test.ts`

**Interfaces:**
- Consumes: tablas creadas en Task 2 (`aplicaciones_pago`, `gastos`, `transacciones`).

- [ ] **Step 1: Escribir el test que verifica los constraints (falla primero — los constraints no existen)**

Crear `tests/db/constraints.test.ts`:

```typescript
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";

describe("Constraints de integridad financiera", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("rechaza AplicacionPago sin id_periodo_pago ni id_gasto", async () => {
    const txn = await prisma.transaccion.create({
      data: { tipo: "INGRESO_COBRO", caja_destino: "TERCEROS", monto: 100 },
    });

    await assert.rejects(
      prisma.aplicacionPago.create({
        data: {
          id_transaccion: txn.id,
          tipo_aplicacion: "CAPITAL",
          monto_aplicado: 100,
        },
      })
    );
  });

  it("rechaza Gasto con id_propiedad null y cargo_a distinto de INMOBILIARIA", async () => {
    await assert.rejects(
      prisma.gasto.create({
        data: {
          id_propiedad: null,
          concepto: "Sueldo",
          monto: 100,
          tipo: "OTRO",
          cargo_a: "PROPIETARIO",
        },
      })
    );
  });

  it("rechaza UPDATE directo sobre transacciones", async () => {
    const txn = await prisma.transaccion.create({
      data: { tipo: "INGRESO_COBRO", caja_destino: "TERCEROS", monto: 100 },
    });

    await assert.rejects(
      prisma.$executeRawUnsafe(
        `UPDATE transacciones SET monto = 999 WHERE id = ${txn.id}`
      )
    );
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --import tsx --test tests/db/constraints.test.ts`
Expected: FAIL en las tres aserciones (todos los `create`/`UPDATE` tienen éxito hoy, ninguno lanza).

- [ ] **Step 3: Escribir la migración de constraints**

```bash
TS=$(date +%Y%m%d%H%M%S)
DIR="prisma/migrations/${TS}_add_financial_constraints"
mkdir -p "$DIR"
cat > "$DIR/migration.sql" << 'EOF'
-- Exactamente uno de id_periodo_pago / id_gasto en aplicaciones_pago
ALTER TABLE "aplicaciones_pago"
  ADD CONSTRAINT "chk_aplicacion_exclusiva"
  CHECK (
    (id_periodo_pago IS NOT NULL AND id_gasto IS NULL) OR
    (id_periodo_pago IS NULL AND id_gasto IS NOT NULL)
  );

-- Si tipo_aplicacion = 'GASTO', id_liquidacion debe ser NULL
ALTER TABLE "aplicaciones_pago"
  ADD CONSTRAINT "chk_gasto_sin_liquidacion"
  CHECK (
    tipo_aplicacion != 'GASTO' OR id_liquidacion IS NULL
  );

-- Gasto sin propiedad debe ser cargo de la inmobiliaria
ALTER TABLE "gastos"
  ADD CONSTRAINT "chk_gasto_propio_inmobiliaria"
  CHECK (
    id_propiedad IS NOT NULL OR cargo_a = 'INMOBILIARIA'
  );

-- Inmutabilidad del libro diario: bloquear UPDATE y DELETE a nivel de rol de aplicación.
-- CURRENT_USER es el rol con el que Prisma se conecta (definido en DATABASE_URL / prisma.config.ts).
REVOKE UPDATE, DELETE ON "transacciones" FROM CURRENT_USER;
EOF

psql "postgresql://gfrancone@localhost:5432/inmotrack" -f "$DIR/migration.sql"
npx prisma migrate resolve --applied "$(basename "$DIR")"
```

**Nota de entorno:** si el rol con el que Prisma se conecta es superusuario de PostgreSQL (verificar con `SELECT rolsuper FROM pg_roles WHERE rolname = current_user;`), el `REVOKE` de arriba no tiene ningún efecto — Postgres hace que los superusuarios ignoren `GRANT`/`REVOKE` por diseño. Si el test del Step 4 falla solo en la aserción de `UPDATE`, es por esto. En ese caso, agregar una migración adicional con un trigger, que sí se dispara sin importar el rol:

```bash
TS=$(date +%Y%m%d%H%M%S)
DIR="prisma/migrations/${TS}_transacciones_immutability_trigger"
mkdir -p "$DIR"
cat > "$DIR/migration.sql" << 'EOF'
CREATE OR REPLACE FUNCTION prevent_transacciones_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'La tabla transacciones es inmutable: no se permite UPDATE ni DELETE. Use un CONTRA_ASIENTO.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transacciones_immutable
BEFORE UPDATE OR DELETE ON "transacciones"
FOR EACH ROW EXECUTE FUNCTION prevent_transacciones_mutation();
EOF

psql "postgresql://gfrancone@localhost:5432/inmotrack" -f "$DIR/migration.sql"
npx prisma migrate resolve --applied "$(basename "$DIR")"
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --import tsx --test tests/db/constraints.test.ts`
Expected: PASS — las tres aserciones ahora lanzan como se espera.

- [ ] **Step 5: Commit**

```bash
git add prisma/migrations tests/db/constraints.test.ts
git commit -m "feat(db): CHECK constraints de integridad + bloqueo de UPDATE/DELETE en transacciones"
```

---

### Task 4: Helper de idempotencia

**Files:**
- Create: `lib/idempotency.ts`
- Test: `tests/lib/idempotency.test.ts`

**Interfaces:**
- Produces:
  - `class IdempotencyConflictError extends Error` — se lanza cuando una key ya fue procesada.
  - `checkIdempotencyKey(tx: Prisma.TransactionClient, key: string): Promise<void>` — lanza `IdempotencyConflictError` si la key ya existe; no hace nada si no existe.
  - `persistIdempotencyKey(tx: Prisma.TransactionClient, key: string, responseStatus: number): Promise<void>`
- Consumes: `prisma` de `@/lib/db` (solo en el test, para preparar datos).

- [ ] **Step 1: Escribir el test (falla primero — el módulo no existe)**

Crear `tests/lib/idempotency.test.ts`:

```typescript
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import {
  checkIdempotencyKey,
  persistIdempotencyKey,
  IdempotencyConflictError,
} from "@/lib/idempotency";

describe("idempotencia", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("no lanza si la key no existe todavía", async () => {
    await assert.doesNotReject(
      prisma.$transaction((tx) => checkIdempotencyKey(tx, "key-nueva"))
    );
  });

  it("lanza IdempotencyConflictError si la key ya fue persistida", async () => {
    await prisma.$transaction((tx) => persistIdempotencyKey(tx, "key-repetida", 201));

    await assert.rejects(
      prisma.$transaction((tx) => checkIdempotencyKey(tx, "key-repetida")),
      IdempotencyConflictError
    );
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --import tsx --test tests/lib/idempotency.test.ts`
Expected: FAIL — `Cannot find module '@/lib/idempotency'`.

- [ ] **Step 3: Implementar `lib/idempotency.ts`**

```typescript
import type { Prisma } from "@prisma/client";

export class IdempotencyConflictError extends Error {
  constructor(key: string) {
    super(`La operación con idempotency_key "${key}" ya fue procesada.`);
    this.name = "IdempotencyConflictError";
  }
}

export async function checkIdempotencyKey(
  tx: Prisma.TransactionClient,
  key: string
): Promise<void> {
  const existente = await tx.idempotencyKey.findUnique({ where: { key } });
  if (existente) throw new IdempotencyConflictError(key);
}

export async function persistIdempotencyKey(
  tx: Prisma.TransactionClient,
  key: string,
  responseStatus: number
): Promise<void> {
  await tx.idempotencyKey.create({
    data: { key, response_status: responseStatus },
  });
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --import tsx --test tests/lib/idempotency.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/idempotency.ts tests/lib/idempotency.test.ts
git commit -m "feat: helper de idempotencia reutilizable"
```

---

### Task 5: `pagos.service.ts` — prelación punitorio → capital

**Files:**
- Create: `services/pagos.service.ts`
- Create: `schemas/pago.schema.ts`
- Test: `tests/services/pagos.service.test.ts`

**Interfaces:**
- Consumes: `checkIdempotencyKey`, `persistIdempotencyKey` de `@/lib/idempotency` (Task 4).
- Produces:
  - `PagosService.registrar(input: PagoInput & { id_usuario_creador: number }): Promise<ResultadoPago>`
  - `type ResultadoPago = { procesado: true; aplicado_punitorios: string; aplicado_capital: string; saldo_sobrante: string }` (montos como string decimal, no `number`, para no perder precisión al serializar).
  - `schemas/pago.schema.ts` exporta `pagoSchema` (Zod) y `type PagoInput = z.infer<typeof pagoSchema>`.

- [ ] **Step 1: Escribir `schemas/pago.schema.ts`**

```typescript
import { z } from "zod";

export const pagoSchema = z.object({
  id_contrato: z.number().int().positive(),
  monto_pagado: z.number().positive(),
  idempotency_key: z.string().uuid(),
});

export type PagoInput = z.infer<typeof pagoSchema>;
```

- [ ] **Step 2: Escribir el test del caso principal (falla primero — el servicio no existe)**

Crear `tests/services/pagos.service.test.ts`:

```typescript
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import { PagosService } from "@/services/pagos.service";

async function crearEscenarioBasico() {
  const propietario = await prisma.propietario.create({
    data: { nombre: "Dueño Test", cbu: "0000000000000000000000" },
  });
  const propiedad = await prisma.propiedad.create({
    data: { id_propietario: propietario.id, direccion: "Calle Falsa 123", es_propia: false },
  });
  const inquilino = await prisma.inquilino.create({
    data: { nombre: "Inquilino Test", dni_cuit: "20111111111" },
  });
  const usuario = await prisma.usuario.create({
    data: { email: "admin@test.com", password_hash: "x", rol: "ADMIN" },
  });
  const contrato = await prisma.contrato.create({
    data: {
      id_propiedad: propiedad.id,
      id_inquilino: inquilino.id,
      fecha_inicio: new Date("2026-01-01"),
      fecha_fin: new Date("2026-12-31"),
      estado: "ACTIVO",
      monto_base: 100000,
      pct_comision: 10,
    },
  });
  const periodo = await prisma.periodoPago.create({
    data: {
      id_contrato: contrato.id,
      periodo: "2026-08",
      monto_cargo: 100000,
      punitorios_devengados: 5000,
      fecha_vencimiento: new Date("2026-08-10"),
      estado: "VENCIDO_IMPAGO",
    },
  });
  return { propietario, propiedad, inquilino, usuario, contrato, periodo };
}

describe("PagosService.registrar", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("aplica primero a punitorios, después a capital, y genera INGRESO_COMISION proporcional", async () => {
    const { contrato, periodo, usuario } = await crearEscenarioBasico();

    const resultado = await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 105000,
      idempotency_key: "11111111-1111-1111-1111-111111111111",
      id_usuario_creador: usuario.id,
    });

    assert.equal(resultado.procesado, true);

    const periodoActualizado = await prisma.periodoPago.findUniqueOrThrow({
      where: { id: periodo.id },
    });
    assert.equal(Number(periodoActualizado.monto_cobrado), 100000);
    assert.equal(Number(periodoActualizado.punitorios_cobrados), 5000);
    assert.equal(periodoActualizado.estado, "COBRADO_TOTAL");

    const aplicaciones = await prisma.aplicacionPago.findMany({
      where: { id_periodo_pago: periodo.id },
      orderBy: { tipo_aplicacion: "asc" },
    });
    assert.equal(aplicaciones.length, 2);
    assert.deepEqual(aplicaciones.map((a) => a.tipo_aplicacion).sort(), ["CAPITAL", "PUNITORIO"]);

    const transacciones = await prisma.transaccion.findMany({
      where: { id_contrato: contrato.id },
      orderBy: { tipo: "asc" },
    });
    const tipos = transacciones.map((t) => t.tipo).sort();
    assert.deepEqual(tipos, ["INGRESO_COBRO", "INGRESO_COMISION", "INGRESO_PUNITORIO"]);

    const comision = transacciones.find((t) => t.tipo === "INGRESO_COMISION")!;
    assert.equal(Number(comision.monto), 10000); // 10% de 100000
    assert.equal(comision.caja_destino, "OPERATIVA");

    const punitorio = transacciones.find((t) => t.tipo === "INGRESO_PUNITORIO")!;
    assert.equal(Number(punitorio.monto), 5000);
    assert.equal(punitorio.caja_destino, "OPERATIVA");
  });

  it("genera INGRESO_ALQUILER_PROPIO en vez de INGRESO_COMISION cuando la propiedad es propia", async () => {
    const { propiedad, contrato, usuario } = await crearEscenarioBasico();
    await prisma.propiedad.update({ where: { id: propiedad.id }, data: { es_propia: true } });
    await prisma.contrato.update({ where: { id: contrato.id }, data: { pct_comision: 100 } });

    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 100000,
      idempotency_key: "22222222-2222-2222-2222-222222222222",
      id_usuario_creador: usuario.id,
    });

    const transacciones = await prisma.transaccion.findMany({ where: { id_contrato: contrato.id } });
    assert.equal(transacciones.some((t) => t.tipo === "INGRESO_ALQUILER_PROPIO"), true);
    assert.equal(transacciones.some((t) => t.tipo === "INGRESO_COMISION"), false);
  });

  it("rechaza un pago repetido con la misma idempotency_key", async () => {
    const { contrato, usuario } = await crearEscenarioBasico();
    const key = "33333333-3333-3333-3333-333333333333";

    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 1000,
      idempotency_key: key,
      id_usuario_creador: usuario.id,
    });

    await assert.rejects(
      PagosService.registrar({
        id_contrato: contrato.id,
        monto_pagado: 1000,
        idempotency_key: key,
        id_usuario_creador: usuario.id,
      })
    );
  });
});
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `node --import tsx --test tests/services/pagos.service.test.ts`
Expected: FAIL — `Cannot find module '@/services/pagos.service'`.

- [ ] **Step 4: Implementar `services/pagos.service.ts`**

```typescript
import { Decimal } from "@prisma/client";
import { prisma } from "@/lib/db";
import { checkIdempotencyKey, persistIdempotencyKey } from "@/lib/idempotency";

export type ResultadoPago = {
  procesado: true;
  aplicado_punitorios: string;
  aplicado_capital: string;
  saldo_sobrante: string;
};

export const PagosService = {
  async registrar({
    id_contrato,
    monto_pagado,
    idempotency_key,
    id_usuario_creador,
  }: {
    id_contrato: number;
    monto_pagado: number;
    idempotency_key: string;
    id_usuario_creador: number;
  }): Promise<ResultadoPago> {
    return prisma.$transaction(
      async (tx) => {
        await checkIdempotencyKey(tx, idempotency_key);

        const contrato = await tx.contrato.findUniqueOrThrow({
          where: { id: id_contrato },
          include: { propiedad: true },
        });

        // Lock de los períodos del contrato — evita doble aplicación en paralelo
        await tx.$queryRawUnsafe(
          `SELECT id FROM periodos_pago WHERE id_contrato = $1 FOR UPDATE`,
          id_contrato
        );

        let saldo = new Decimal(monto_pagado);
        let aplicadoPunitorios = new Decimal(0);
        let aplicadoCapital = new Decimal(0);

        const txnCobro = await tx.transaccion.create({
          data: {
            tipo: "INGRESO_COBRO",
            caja_destino: "TERCEROS",
            monto: saldo,
            id_contrato,
            id_usuario_creador,
          },
        });

        const periodos = await tx.periodoPago.findMany({
          where: {
            id_contrato,
            estado: { in: ["CARGO_PENDIENTE", "COBRADO_PARCIAL", "VENCIDO_IMPAGO"] },
          },
          orderBy: { periodo: "asc" },
        });

        // ── Prelación paso 1: punitorios pendientes, período más antiguo primero ──
        for (const periodo of periodos) {
          if (saldo.lessThanOrEqualTo(0)) break;

          const deudaPunitorio = new Decimal(periodo.punitorios_devengados).minus(
            periodo.punitorios_cobrados
          );
          if (deudaPunitorio.lessThanOrEqualTo(0)) continue;

          const abono = Decimal.min(saldo, deudaPunitorio);

          const txnPunitorio = await tx.transaccion.create({
            data: {
              tipo: "INGRESO_PUNITORIO",
              caja_destino: "OPERATIVA",
              monto: abono,
              id_contrato,
              id_usuario_creador,
            },
          });

          await tx.aplicacionPago.create({
            data: {
              id_transaccion: txnPunitorio.id,
              id_periodo_pago: periodo.id,
              tipo_aplicacion: "PUNITORIO",
              monto_aplicado: abono,
            },
          });

          await tx.periodoPago.update({
            where: { id: periodo.id },
            data: { punitorios_cobrados: new Decimal(periodo.punitorios_cobrados).plus(abono) },
          });

          saldo = saldo.minus(abono);
          aplicadoPunitorios = aplicadoPunitorios.plus(abono);
        }

        // ── Prelación paso 2: capital, período más antiguo primero ──
        for (const periodo of periodos) {
          if (saldo.lessThanOrEqualTo(0)) break;

          const deudaCapital = new Decimal(periodo.monto_cargo).minus(periodo.monto_cobrado);
          if (deudaCapital.lessThanOrEqualTo(0)) continue;

          const abono = Decimal.min(saldo, deudaCapital);

          await tx.aplicacionPago.create({
            data: {
              id_transaccion: txnCobro.id,
              id_periodo_pago: periodo.id,
              tipo_aplicacion: "CAPITAL",
              monto_aplicado: abono,
            },
          });

          const nuevoMontoCobrado = new Decimal(periodo.monto_cobrado).plus(abono);
          const nuevoEstado = nuevoMontoCobrado.greaterThanOrEqualTo(periodo.monto_cargo)
            ? "COBRADO_TOTAL"
            : "COBRADO_PARCIAL";

          await tx.periodoPago.update({
            where: { id: periodo.id },
            data: { monto_cobrado: nuevoMontoCobrado, estado: nuevoEstado },
          });

          const esPropia = contrato.propiedad.es_propia;
          const pctComision = new Decimal(contrato.pct_comision);
          const montoComision = abono.times(pctComision).dividedBy(100);

          if (montoComision.greaterThan(0)) {
            await tx.transaccion.create({
              data: {
                tipo: esPropia ? "INGRESO_ALQUILER_PROPIO" : "INGRESO_COMISION",
                caja_destino: "OPERATIVA",
                monto: montoComision,
                id_contrato,
                id_usuario_creador,
              },
            });
          }

          saldo = saldo.minus(abono);
          aplicadoCapital = aplicadoCapital.plus(abono);
        }

        // ── Evaluar transición MOROSO → ACTIVO ──
        if (contrato.estado === "MOROSO") {
          const vencidos = await tx.periodoPago.count({
            where: { id_contrato, estado: "VENCIDO_IMPAGO" },
          });
          if (vencidos < 2) {
            await tx.contrato.update({ where: { id: id_contrato }, data: { estado: "ACTIVO" } });
          }
        }

        await persistIdempotencyKey(tx, idempotency_key, 201);

        return {
          procesado: true as const,
          aplicado_punitorios: aplicadoPunitorios.toFixed(2),
          aplicado_capital: aplicadoCapital.toFixed(2),
          saldo_sobrante: saldo.toFixed(2),
        };
      },
      { timeout: 30_000 }
    );
  },
};
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `node --import tsx --test tests/services/pagos.service.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add services/pagos.service.ts schemas/pago.schema.ts tests/services/pagos.service.test.ts
git commit -m "feat: PagosService con prelación punitorio->capital y comisión en tiempo real"
```

---

### Task 6: `pagos.service.ts` — extender la prelación con gastos a cargo del inquilino

**Files:**
- Modify: `services/pagos.service.ts`
- Modify: `tests/services/pagos.service.test.ts`

**Interfaces:**
- Consumes: `Gasto` (Task 2), `cargo_a = INQUILINO`.
- Produces: mismo `PagosService.registrar`, ahora con un tercer paso de prelación.

- [ ] **Step 1: Agregar el test del tercer paso de prelación (falla primero)**

Agregar a `tests/services/pagos.service.test.ts`, dentro del `describe`:

```typescript
  it("aplica el saldo restante a gastos a cargo del inquilino después de punitorios y capital", async () => {
    const { contrato, periodo, propiedad, usuario } = await crearEscenarioBasico();
    await prisma.periodoPago.update({
      where: { id: periodo.id },
      data: { punitorios_devengados: 0 }, // sin punitorios para simplificar este caso
    });
    const gasto = await prisma.gasto.create({
      data: {
        id_propiedad: propiedad.id,
        id_contrato: contrato.id,
        concepto: "Arreglo de cañería",
        monto: 20000,
        tipo: "ARREGLO",
        cargo_a: "INQUILINO",
      },
    });

    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 110000, // 100000 capital + 10000 hacia el gasto
      idempotency_key: "44444444-4444-4444-4444-444444444444",
      id_usuario_creador: usuario.id,
    });

    const aplicacionGasto = await prisma.aplicacionPago.findFirst({
      where: { id_gasto: gasto.id },
    });
    assert.notEqual(aplicacionGasto, null);
    assert.equal(Number(aplicacionGasto!.monto_aplicado), 10000);
    assert.equal(aplicacionGasto!.tipo_aplicacion, "GASTO");
  });
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --import tsx --test tests/services/pagos.service.test.ts`
Expected: FAIL — no se crea ninguna `AplicacionPago` con `id_gasto`, `aplicacionGasto` es `null`.

- [ ] **Step 3: Extender `services/pagos.service.ts` con el paso 3 de prelación**

Insertar, dentro de `PagosService.registrar`, inmediatamente después del bloque "Prelación paso 2: capital" y antes de "Evaluar transición MOROSO → ACTIVO":

```typescript
        // ── Prelación paso 3: gastos a cargo del inquilino, más antiguo primero ──
        if (saldo.greaterThan(0)) {
          const gastosInquilino = await tx.gasto.findMany({
            where: { id_contrato, cargo_a: "INQUILINO" },
            include: { aplicaciones: true },
          });

          for (const gasto of gastosInquilino) {
            if (saldo.lessThanOrEqualTo(0)) break;

            const cobradoHastaAhora = gasto.aplicaciones.reduce(
              (acc, a) => acc.plus(a.monto_aplicado),
              new Decimal(0)
            );
            const deudaGasto = new Decimal(gasto.monto).minus(cobradoHastaAhora);
            if (deudaGasto.lessThanOrEqualTo(0)) continue;

            const abono = Decimal.min(saldo, deudaGasto);

            await tx.aplicacionPago.create({
              data: {
                id_transaccion: txnCobro.id,
                id_gasto: gasto.id,
                tipo_aplicacion: "GASTO",
                monto_aplicado: abono,
              },
            });

            saldo = saldo.minus(abono);
          }
        }
```

- [ ] **Step 4: Correr el test completo para verificar que pasa**

Run: `node --import tsx --test tests/services/pagos.service.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add services/pagos.service.ts tests/services/pagos.service.test.ts
git commit -m "feat: PagosService aplica el saldo remanente a gastos del inquilino"
```

---

### Task 7: `gastos.service.ts` — crear gasto

**Files:**
- Create: `services/gastos.service.ts`
- Create: `schemas/gasto.schema.ts`
- Test: `tests/services/gastos.service.test.ts`

**Interfaces:**
- Produces:
  - `GastosService.crear(data: GastoInput): Promise<Gasto>`
  - `schemas/gasto.schema.ts` exporta `gastoSchema` con `.refine()` para la regla "sin propiedad ⟹ INMOBILIARIA", y `type GastoInput`.

- [ ] **Step 1: Escribir `schemas/gasto.schema.ts`**

```typescript
import { z } from "zod";

export const gastoSchema = z
  .object({
    id_propiedad: z.number().int().positive().optional(),
    id_contrato: z.number().int().positive().optional(),
    concepto: z.string().min(1, "El concepto es requerido."),
    categoria_interno: z.string().optional(),
    monto: z.number().positive("El monto debe ser mayor a 0."),
    tipo: z.enum(["ARREGLO", "EXPENSA", "GAS", "LUZ", "IMPUESTO", "OTRO"]),
    cargo_a: z.enum(["INQUILINO", "PROPIETARIO", "INMOBILIARIA"]),
    fecha_gasto: z.string().min(1),
  })
  .refine((d) => d.id_propiedad !== undefined || d.cargo_a === "INMOBILIARIA", {
    message: "Un gasto sin propiedad debe ser cargo_a INMOBILIARIA.",
    path: ["cargo_a"],
  });

export type GastoInput = z.infer<typeof gastoSchema>;
```

- [ ] **Step 2: Escribir el test (falla primero — el servicio no existe)**

Crear `tests/services/gastos.service.test.ts`:

```typescript
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import { GastosService } from "@/services/gastos.service";

describe("GastosService.crear", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("crea un gasto de propiedad con cargo_a PROPIETARIO", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle 1", es_propia: false },
    });

    const gasto = await GastosService.crear({
      id_propiedad: propiedad.id,
      concepto: "Pintura de fachada",
      monto: 30000,
      tipo: "ARREGLO",
      cargo_a: "PROPIETARIO",
    });

    assert.equal(gasto.id_propiedad, propiedad.id);
    assert.equal(gasto.estado_pago, "PENDIENTE");
  });

  it("crea un gasto propio de la inmobiliaria sin propiedad", async () => {
    const gasto = await GastosService.crear({
      concepto: "Sueldo administrativo",
      categoria_interno: "Sueldos",
      monto: 500000,
      tipo: "OTRO",
      cargo_a: "INMOBILIARIA",
    });

    assert.equal(gasto.id_propiedad, null);
    assert.equal(gasto.categoria_interno, "Sueldos");
  });
});
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `node --import tsx --test tests/services/gastos.service.test.ts`
Expected: FAIL — `Cannot find module '@/services/gastos.service'`.

- [ ] **Step 4: Implementar `services/gastos.service.ts` (solo `crear` por ahora)**

```typescript
import { prisma } from "@/lib/db";
import type { GastoInput } from "@/schemas/gasto.schema";

export const GastosService = {
  async crear(data: GastoInput & { fecha_gasto?: string }) {
    return prisma.gasto.create({
      data: {
        id_propiedad: data.id_propiedad ?? null,
        id_contrato: data.id_contrato ?? null,
        concepto: data.concepto,
        categoria_interno: data.categoria_interno ?? null,
        monto: data.monto,
        tipo: data.tipo,
        cargo_a: data.cargo_a,
      },
    });
  },
};
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `node --import tsx --test tests/services/gastos.service.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add services/gastos.service.ts schemas/gasto.schema.ts tests/services/gastos.service.test.ts
git commit -m "feat: GastosService.crear, con soporte de gasto propio sin propiedad"
```

---

### Task 8: `gastos.service.ts` — marcar pagado al proveedor (separación de cajas)

**Files:**
- Modify: `services/gastos.service.ts`
- Modify: `tests/services/gastos.service.test.ts`

**Interfaces:**
- Produces: `GastosService.marcarPagado(id: number, id_usuario_creador: number): Promise<Gasto>` — genera `EGRESO_TERCEROS` (caja TERCEROS) si el gasto tiene propiedad, `EGRESO_OPERATIVO` (caja OPERATIVA) si `cargo_a = INMOBILIARIA`.

- [ ] **Step 1: Agregar los tests (fallan primero)**

Agregar a `tests/services/gastos.service.test.ts`:

```typescript
describe("GastosService.marcarPagado", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("genera EGRESO_TERCEROS al pagar un gasto de propiedad", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle 1", es_propia: false },
    });
    const usuario = await prisma.usuario.create({
      data: { email: "admin2@test.com", password_hash: "x", rol: "ADMIN" },
    });
    const gasto = await GastosService.crear({
      id_propiedad: propiedad.id,
      concepto: "Plomero",
      monto: 15000,
      tipo: "ARREGLO",
      cargo_a: "PROPIETARIO",
    });

    await GastosService.marcarPagado(gasto.id, usuario.id);

    const actualizado = await prisma.gasto.findUniqueOrThrow({ where: { id: gasto.id } });
    assert.equal(actualizado.estado_pago, "PAGADO_PROVEEDOR");

    const txn = await prisma.transaccion.findFirstOrThrow({ where: { tipo: "EGRESO_TERCEROS" } });
    assert.equal(txn.caja_destino, "TERCEROS");
    assert.equal(Number(txn.monto), -15000);
  });

  it("genera EGRESO_OPERATIVO al pagar un gasto propio de la inmobiliaria", async () => {
    const usuario = await prisma.usuario.create({
      data: { email: "admin3@test.com", password_hash: "x", rol: "ADMIN" },
    });
    const gasto = await GastosService.crear({
      concepto: "Alquiler de oficina",
      monto: 200000,
      tipo: "OTRO",
      cargo_a: "INMOBILIARIA",
    });

    await GastosService.marcarPagado(gasto.id, usuario.id);

    const txn = await prisma.transaccion.findFirstOrThrow({ where: { tipo: "EGRESO_OPERATIVO" } });
    assert.equal(txn.caja_destino, "OPERATIVA");
    assert.equal(Number(txn.monto), -200000);
  });

  it("rechaza marcar como pagado un gasto que ya fue pagado", async () => {
    const usuario = await prisma.usuario.create({
      data: { email: "admin4@test.com", password_hash: "x", rol: "ADMIN" },
    });
    const gasto = await GastosService.crear({
      concepto: "Alquiler de oficina",
      monto: 200000,
      tipo: "OTRO",
      cargo_a: "INMOBILIARIA",
    });
    await GastosService.marcarPagado(gasto.id, usuario.id);

    await assert.rejects(GastosService.marcarPagado(gasto.id, usuario.id));
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --import tsx --test tests/services/gastos.service.test.ts`
Expected: FAIL — `GastosService.marcarPagado is not a function`.

- [ ] **Step 3: Implementar `marcarPagado` en `services/gastos.service.ts`**

Agregar al objeto `GastosService`:

```typescript
  async marcarPagado(id: number, id_usuario_creador: number) {
    return prisma.$transaction(async (tx) => {
      const gasto = await tx.gasto.findUniqueOrThrow({ where: { id } });

      if (gasto.estado_pago === "PAGADO_PROVEEDOR") {
        throw new Error("Este gasto ya fue marcado como pagado.");
      }

      const actualizado = await tx.gasto.update({
        where: { id },
        data: { estado_pago: "PAGADO_PROVEEDOR" },
      });

      const esGastoPropio = gasto.cargo_a === "INMOBILIARIA";

      await tx.transaccion.create({
        data: {
          tipo: esGastoPropio ? "EGRESO_OPERATIVO" : "EGRESO_TERCEROS",
          caja_destino: esGastoPropio ? "OPERATIVA" : "TERCEROS",
          monto: -Number(gasto.monto),
          id_contrato: gasto.id_contrato,
          id_usuario_creador,
        },
      });

      return actualizado;
    });
  },
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --import tsx --test tests/services/gastos.service.test.ts`
Expected: PASS (5 tests en total)

- [ ] **Step 5: Commit**

```bash
git add services/gastos.service.ts tests/services/gastos.service.test.ts
git commit -m "feat: GastosService.marcarPagado separa EGRESO_TERCEROS de EGRESO_OPERATIVO"
```

---

### Task 9: `liquidaciones.service.ts` — generar liquidación (snapshot + sellado)

**Files:**
- Create: `services/liquidaciones.service.ts`
- Create: `schemas/liquidacion.schema.ts`
- Test: `tests/services/liquidaciones.service.test.ts`

**Interfaces:**
- Produces:
  - `LiquidacionesService.generarParaPropietario(id_propietario: number): Promise<Liquidacion & { items: LiquidacionItem[] }>`
  - `schemas/liquidacion.schema.ts` exporta `type LiquidacionResumen` (usado por rutas/UI futuras, no por este plan).

- [ ] **Step 1: Escribir `schemas/liquidacion.schema.ts`**

```typescript
export type LiquidacionResumen = {
  id: number;
  id_propietario: number;
  monto_bruto: string;
  retenciones: string;
  monto_neto: string;
  estado: "PENDIENTE" | "APROBADA" | "PAGADA";
};
```

- [ ] **Step 2: Escribir el test (falla primero — el servicio no existe)**

Crear `tests/services/liquidaciones.service.test.ts`:

```typescript
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import { PagosService } from "@/services/pagos.service";
import { GastosService } from "@/services/gastos.service";
import { LiquidacionesService } from "@/services/liquidaciones.service";

describe("LiquidacionesService.generarParaPropietario", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("calcula el neto como capital cobrado menos comisión menos gastos, y sella las aplicaciones", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle 1", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino", dni_cuit: "20111111111" },
    });
    const usuario = await prisma.usuario.create({
      data: { email: "admin5@test.com", password_hash: "x", rol: "ADMIN" },
    });
    const contrato = await prisma.contrato.create({
      data: {
        id_propiedad: propiedad.id,
        id_inquilino: inquilino.id,
        fecha_inicio: new Date("2026-01-01"),
        fecha_fin: new Date("2026-12-31"),
        estado: "ACTIVO",
        monto_base: 100000,
        pct_comision: 10,
      },
    });
    await prisma.periodoPago.create({
      data: {
        id_contrato: contrato.id,
        periodo: "2026-08",
        monto_cargo: 100000,
        fecha_vencimiento: new Date("2026-08-10"),
      },
    });
    const gasto = await GastosService.crear({
      id_propiedad: propiedad.id,
      id_contrato: contrato.id,
      concepto: "Plomero",
      monto: 15000,
      tipo: "ARREGLO",
      cargo_a: "PROPIETARIO",
    });

    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 60000, // parcial: $60.000 de $100.000
      idempotency_key: "55555555-5555-5555-5555-555555555555",
      id_usuario_creador: usuario.id,
    });

    const liquidacion = await LiquidacionesService.generarParaPropietario(propietario.id);

    // bruto 60000, comisión 6000, gasto 15000 -> neto 39000
    assert.equal(Number(liquidacion.monto_bruto), 60000);
    assert.equal(Number(liquidacion.monto_neto), 39000);
    assert.equal(liquidacion.items.length, 1);
    assert.equal(Number(liquidacion.items[0].comision), 6000);
    assert.equal(Number(liquidacion.items[0].gastos), 15000);

    const gastoSellado = await prisma.gasto.findUniqueOrThrow({ where: { id: gasto.id } });
    assert.equal(gastoSellado.id_liquidacion, liquidacion.id);

    const aplicacionSellada = await prisma.aplicacionPago.findFirstOrThrow({
      where: { tipo_aplicacion: "CAPITAL" },
    });
    assert.equal(aplicacionSellada.id_liquidacion, liquidacion.id);
  });

  it("no vuelve a incluir aplicaciones ya liquidadas en una segunda corrida", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño 2", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle 2", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino 2", dni_cuit: "20222222222" },
    });
    const usuario = await prisma.usuario.create({
      data: { email: "admin6@test.com", password_hash: "x", rol: "ADMIN" },
    });
    const contrato = await prisma.contrato.create({
      data: {
        id_propiedad: propiedad.id,
        id_inquilino: inquilino.id,
        fecha_inicio: new Date("2026-01-01"),
        fecha_fin: new Date("2026-12-31"),
        estado: "ACTIVO",
        monto_base: 50000,
        pct_comision: 10,
      },
    });
    await prisma.periodoPago.create({
      data: {
        id_contrato: contrato.id,
        periodo: "2026-08",
        monto_cargo: 50000,
        fecha_vencimiento: new Date("2026-08-10"),
      },
    });
    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 50000,
      idempotency_key: "66666666-6666-6666-6666-666666666666",
      id_usuario_creador: usuario.id,
    });

    await LiquidacionesService.generarParaPropietario(propietario.id);
    const segunda = await LiquidacionesService.generarParaPropietario(propietario.id);

    assert.equal(Number(segunda.monto_bruto), 0);
    assert.equal(segunda.items.length, 0);
  });
});
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `node --import tsx --test tests/services/liquidaciones.service.test.ts`
Expected: FAIL — `Cannot find module '@/services/liquidaciones.service'`.

- [ ] **Step 4: Implementar `services/liquidaciones.service.ts`**

```typescript
import { Decimal } from "@prisma/client";
import { prisma } from "@/lib/db";

export const LiquidacionesService = {
  async generarParaPropietario(id_propietario: number) {
    return prisma.$transaction(async (tx) => {
      // Lock pesimista: evita que dos corridas concurrentes para el mismo
      // propietario lean el mismo lote de aplicaciones/gastos sin liquidar
      // antes de que ninguna las selle (double-counting).
      await tx.$queryRawUnsafe(
        `SELECT ap.id FROM aplicaciones_pago ap
         JOIN periodos_pago pp ON pp.id = ap.id_periodo_pago
         JOIN contratos c ON c.id = pp.id_contrato
         JOIN propiedades prop ON prop.id = c.id_propiedad
         WHERE ap.tipo_aplicacion = 'CAPITAL' AND ap.id_liquidacion IS NULL
           AND prop.id_propietario = $1
         FOR UPDATE OF ap`,
        id_propietario
      );
      await tx.$queryRawUnsafe(
        `SELECT g.id FROM gastos g
         JOIN propiedades prop ON prop.id = g.id_propiedad
         WHERE g.cargo_a = 'PROPIETARIO' AND g.id_liquidacion IS NULL
           AND prop.id_propietario = $1
         FOR UPDATE OF g`,
        id_propietario
      );

      // Aplicaciones de CAPITAL, sin liquidar, de contratos de propiedades de este propietario
      const aplicaciones = await tx.aplicacionPago.findMany({
        where: {
          tipo_aplicacion: "CAPITAL",
          id_liquidacion: null,
          periodo_pago: {
            contrato: { propiedad: { id_propietario } },
          },
        },
        include: {
          periodo_pago: { include: { contrato: true } },
          transaccion: true,
        },
      });

      // Gastos a cargo del propietario, sin liquidar, de sus propiedades
      const gastos = await tx.gasto.findMany({
        where: {
          cargo_a: "PROPIETARIO",
          id_liquidacion: null,
          propiedad: { id_propietario },
        },
      });

      // Agrupar por contrato
      const porContrato = new Map<
        number,
        { bruto: Decimal; comision: Decimal; gastos: Decimal; aplicacionIds: number[] }
      >();

      for (const aplicacion of aplicaciones) {
        const idContrato = aplicacion.periodo_pago!.id_contrato;
        const entry = porContrato.get(idContrato) ?? {
          bruto: new Decimal(0),
          comision: new Decimal(0),
          gastos: new Decimal(0),
          aplicacionIds: [] as number[],
        };
        const monto = new Decimal(aplicacion.monto_aplicado);
        const pctComision = new Decimal(aplicacion.periodo_pago!.contrato.pct_comision);
        entry.bruto = entry.bruto.plus(monto);
        entry.comision = entry.comision.plus(monto.times(pctComision).dividedBy(100));
        entry.aplicacionIds.push(aplicacion.id);
        porContrato.set(idContrato, entry);
      }

      for (const gasto of gastos) {
        if (!gasto.id_contrato) continue;
        const entry = porContrato.get(gasto.id_contrato) ?? {
          bruto: new Decimal(0),
          comision: new Decimal(0),
          gastos: new Decimal(0),
          aplicacionIds: [] as number[],
        };
        entry.gastos = entry.gastos.plus(gasto.monto);
        porContrato.set(gasto.id_contrato, entry);
      }

      const montoBruto = Array.from(porContrato.values()).reduce(
        (acc, e) => acc.plus(e.bruto),
        new Decimal(0)
      );
      const retenciones = Array.from(porContrato.values()).reduce(
        (acc, e) => acc.plus(e.comision).plus(e.gastos),
        new Decimal(0)
      );
      const montoNeto = montoBruto.minus(retenciones);

      const liquidacion = await tx.liquidacion.create({
        data: {
          id_propietario,
          monto_bruto: montoBruto,
          retenciones,
          monto_neto: montoNeto,
        },
      });

      for (const [idContrato, entry] of porContrato) {
        await tx.liquidacionItem.create({
          data: {
            id_liquidacion: liquidacion.id,
            id_contrato: idContrato,
            monto_bruto: entry.bruto,
            comision: entry.comision,
            gastos: entry.gastos,
            monto_neto: entry.bruto.minus(entry.comision).minus(entry.gastos),
          },
        });

        if (entry.aplicacionIds.length > 0) {
          await tx.aplicacionPago.updateMany({
            where: { id: { in: entry.aplicacionIds } },
            data: { id_liquidacion: liquidacion.id },
          });
        }
      }

      if (gastos.length > 0) {
        await tx.gasto.updateMany({
          where: { id: { in: gastos.map((g) => g.id) } },
          data: { id_liquidacion: liquidacion.id },
        });
      }

      return tx.liquidacion.findUniqueOrThrow({
        where: { id: liquidacion.id },
        include: { items: true },
      });
    });
  },
};
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `node --import tsx --test tests/services/liquidaciones.service.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add services/liquidaciones.service.ts schemas/liquidacion.schema.ts tests/services/liquidaciones.service.test.ts
git commit -m "feat: LiquidacionesService.generarParaPropietario con snapshot y sellado de rendición"
```

---

### Task 10: `liquidaciones.service.ts` — aprobar y confirmar pago

**Files:**
- Modify: `services/liquidaciones.service.ts`
- Modify: `tests/services/liquidaciones.service.test.ts`

**Interfaces:**
- Produces:
  - `LiquidacionesService.aprobar(id: number, id_usuario_creador: number): Promise<Liquidacion>`
  - `LiquidacionesService.confirmarPago(id: number): Promise<Liquidacion>`

- [ ] **Step 1: Agregar los tests (fallan primero)**

Agregar a `tests/services/liquidaciones.service.test.ts`:

```typescript
describe("LiquidacionesService.aprobar / confirmarPago", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("aprobar genera EGRESO_LIQUIDACION por el monto neto y cambia el estado", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño 3", cbu: "0000000000000000000000" },
    });
    const usuario = await prisma.usuario.create({
      data: { email: "admin7@test.com", password_hash: "x", rol: "ADMIN" },
    });
    const liquidacion = await prisma.liquidacion.create({
      data: {
        id_propietario: propietario.id,
        monto_bruto: 60000,
        retenciones: 21000,
        monto_neto: 39000,
      },
    });

    const aprobada = await LiquidacionesService.aprobar(liquidacion.id, usuario.id);
    assert.equal(aprobada.estado, "APROBADA");

    const txn = await prisma.transaccion.findFirstOrThrow({ where: { tipo: "EGRESO_LIQUIDACION" } });
    assert.equal(txn.caja_destino, "TERCEROS");
    assert.equal(Number(txn.monto), -39000);

    const confirmada = await LiquidacionesService.confirmarPago(liquidacion.id);
    assert.equal(confirmada.estado, "PAGADA");
  });

  it("rechaza confirmar el pago de una liquidación que no fue aprobada", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño 4", cbu: "0000000000000000000000" },
    });
    const liquidacion = await prisma.liquidacion.create({
      data: {
        id_propietario: propietario.id,
        monto_bruto: 1000,
        retenciones: 0,
        monto_neto: 1000,
      },
    });

    await assert.rejects(LiquidacionesService.confirmarPago(liquidacion.id));
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --import tsx --test tests/services/liquidaciones.service.test.ts`
Expected: FAIL — `LiquidacionesService.aprobar is not a function`.

- [ ] **Step 3: Implementar `aprobar` y `confirmarPago`**

Agregar al objeto `LiquidacionesService`:

```typescript
  async aprobar(id: number, id_usuario_creador: number) {
    return prisma.$transaction(async (tx) => {
      // Lock pesimista: dos aprobaciones simultáneas de la misma liquidación
      // (doble clic, dos pestañas) no deben generar dos EGRESO_LIQUIDACION.
      await tx.$queryRawUnsafe(
        `SELECT id FROM liquidaciones WHERE id = $1 FOR UPDATE`,
        id
      );
      const liquidacion = await tx.liquidacion.findUniqueOrThrow({ where: { id } });

      if (liquidacion.estado !== "PENDIENTE") {
        throw new Error("Solo se pueden aprobar liquidaciones en estado PENDIENTE.");
      }

      await tx.transaccion.create({
        data: {
          tipo: "EGRESO_LIQUIDACION",
          caja_destino: "TERCEROS",
          monto: new Decimal(liquidacion.monto_neto).negated(),
          id_usuario_creador,
        },
      });

      return tx.liquidacion.update({ where: { id }, data: { estado: "APROBADA" } });
    });
  },

  async confirmarPago(id: number) {
    const liquidacion = await prisma.liquidacion.findUniqueOrThrow({ where: { id } });

    if (liquidacion.estado !== "APROBADA") {
      throw new Error("Solo se puede confirmar el pago de liquidaciones en estado APROBADA.");
    }

    return prisma.liquidacion.update({ where: { id }, data: { estado: "PAGADA" } });
  },
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --import tsx --test tests/services/liquidaciones.service.test.ts`
Expected: PASS (4 tests en total)

- [ ] **Step 5: Commit**

```bash
git add services/liquidaciones.service.ts tests/services/liquidaciones.service.test.ts
git commit -m "feat: LiquidacionesService.aprobar y confirmarPago"
```

---

### Task 11: `transacciones.service.ts` — contra-asiento

**Files:**
- Create: `services/transacciones.service.ts`
- Test: `tests/services/transacciones.service.test.ts`

**Interfaces:**
- Produces: `TransaccionesService.crearContraAsiento({ id_txn_origen, comentario, id_usuario_creador }): Promise<Transaccion>` — valida que la transacción origen exista, que `comentario` no esté vacío, crea el contra-asiento con monto invertido, y si la transacción origen tenía `AplicacionPago`, crea las reversiones correspondientes (mismo `tipo_aplicacion`/entidad de deuda, monto negativo).

- [ ] **Step 1: Escribir el test (falla primero — el servicio no existe)**

Crear `tests/services/transacciones.service.test.ts`:

```typescript
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import { TransaccionesService } from "@/services/transacciones.service";

describe("TransaccionesService.crearContraAsiento", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("crea una transacción con monto invertido y la enlaza a la original", async () => {
    const usuario = await prisma.usuario.create({
      data: { email: "admin8@test.com", password_hash: "x", rol: "ADMIN" },
    });
    const original = await prisma.transaccion.create({
      data: { tipo: "INGRESO_PUNITORIO", caja_destino: "OPERATIVA", monto: 5000 },
    });

    const contraAsiento = await TransaccionesService.crearContraAsiento({
      id_txn_origen: original.id,
      comentario: "Punitorio generado por error, contrato ya saldado.",
      id_usuario_creador: usuario.id,
    });

    assert.equal(contraAsiento.tipo, "CONTRA_ASIENTO");
    assert.equal(Number(contraAsiento.monto), -5000);
    assert.equal(contraAsiento.id_txn_origen, original.id);
    assert.equal(contraAsiento.caja_destino, original.caja_destino);
  });

  it("reversa la AplicacionPago asociada a la transacción original", async () => {
    const usuario = await prisma.usuario.create({
      data: { email: "admin9@test.com", password_hash: "x", rol: "ADMIN" },
    });
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño 5", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle 5", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino 5", dni_cuit: "20333333333" },
    });
    const contrato = await prisma.contrato.create({
      data: {
        id_propiedad: propiedad.id,
        id_inquilino: inquilino.id,
        fecha_inicio: new Date("2026-01-01"),
        fecha_fin: new Date("2026-12-31"),
        monto_base: 1000,
        pct_comision: 10,
      },
    });
    const periodo = await prisma.periodoPago.create({
      data: {
        id_contrato: contrato.id,
        periodo: "2026-08",
        monto_cargo: 1000,
        fecha_vencimiento: new Date("2026-08-10"),
      },
    });
    const original = await prisma.transaccion.create({
      data: { tipo: "INGRESO_PUNITORIO", caja_destino: "OPERATIVA", monto: 500 },
    });
    await prisma.aplicacionPago.create({
      data: {
        id_transaccion: original.id,
        id_periodo_pago: periodo.id,
        tipo_aplicacion: "PUNITORIO",
        monto_aplicado: 500,
      },
    });
    await prisma.periodoPago.update({
      where: { id: periodo.id },
      data: { punitorios_cobrados: 500 },
    });

    await TransaccionesService.crearContraAsiento({
      id_txn_origen: original.id,
      comentario: "Error de carga.",
      id_usuario_creador: usuario.id,
    });

    const periodoActualizado = await prisma.periodoPago.findUniqueOrThrow({
      where: { id: periodo.id },
    });
    assert.equal(Number(periodoActualizado.punitorios_cobrados), 0);
  });

  it("rechaza un contra-asiento sin comentario", async () => {
    const usuario = await prisma.usuario.create({
      data: { email: "admin10@test.com", password_hash: "x", rol: "ADMIN" },
    });
    const original = await prisma.transaccion.create({
      data: { tipo: "INGRESO_COBRO", caja_destino: "TERCEROS", monto: 100 },
    });

    await assert.rejects(
      TransaccionesService.crearContraAsiento({
        id_txn_origen: original.id,
        comentario: "",
        id_usuario_creador: usuario.id,
      })
    );
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --import tsx --test tests/services/transacciones.service.test.ts`
Expected: FAIL — `Cannot find module '@/services/transacciones.service'`.

- [ ] **Step 3: Implementar `services/transacciones.service.ts`**

```typescript
import { Decimal } from "@prisma/client";
import { prisma } from "@/lib/db";

export const TransaccionesService = {
  async crearContraAsiento({
    id_txn_origen,
    comentario,
    id_usuario_creador,
  }: {
    id_txn_origen: number;
    comentario: string;
    id_usuario_creador: number;
  }) {
    if (!comentario || comentario.trim().length === 0) {
      throw new Error("El comentario es obligatorio para un contra-asiento.");
    }

    return prisma.$transaction(async (tx) => {
      const original = await tx.transaccion.findUniqueOrThrow({
        where: { id: id_txn_origen },
        include: { aplicaciones: true },
      });

      const contraAsiento = await tx.transaccion.create({
        data: {
          tipo: "CONTRA_ASIENTO",
          caja_destino: original.caja_destino,
          monto: new Decimal(original.monto).negated(),
          id_contrato: original.id_contrato,
          id_txn_origen: original.id,
          comentario,
          id_usuario_creador,
        },
      });

      for (const aplicacion of original.aplicaciones) {
        const montoReversa = new Decimal(aplicacion.monto_aplicado).negated();

        await tx.aplicacionPago.create({
          data: {
            id_transaccion: contraAsiento.id,
            id_periodo_pago: aplicacion.id_periodo_pago,
            id_gasto: aplicacion.id_gasto,
            tipo_aplicacion: aplicacion.tipo_aplicacion,
            monto_aplicado: montoReversa,
          },
        });

        if (aplicacion.id_periodo_pago) {
          const periodo = await tx.periodoPago.findUniqueOrThrow({
            where: { id: aplicacion.id_periodo_pago },
          });

          if (aplicacion.tipo_aplicacion === "PUNITORIO") {
            await tx.periodoPago.update({
              where: { id: periodo.id },
              data: {
                punitorios_cobrados: new Decimal(periodo.punitorios_cobrados).plus(montoReversa),
              },
            });
          } else if (aplicacion.tipo_aplicacion === "CAPITAL") {
            const nuevoMontoCobrado = new Decimal(periodo.monto_cobrado).plus(montoReversa);
            await tx.periodoPago.update({
              where: { id: periodo.id },
              data: {
                monto_cobrado: nuevoMontoCobrado,
                estado: nuevoMontoCobrado.greaterThanOrEqualTo(periodo.monto_cargo)
                  ? "COBRADO_TOTAL"
                  : nuevoMontoCobrado.greaterThan(0)
                    ? "COBRADO_PARCIAL"
                    : "CARGO_PENDIENTE",
              },
            });
          }
        }
      }

      return contraAsiento;
    });
  },
};
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --import tsx --test tests/services/transacciones.service.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add services/transacciones.service.ts tests/services/transacciones.service.test.ts
git commit -m "feat: TransaccionesService.crearContraAsiento con reversión de AplicacionPago"
```

---

### Task 12: `inquilinos.service.ts` — enriquecer `obtenerSaldo`

**Files:**
- Modify: `services/inquilinos.service.ts`
- Create: `tests/services/inquilinos.service.test.ts`

**Interfaces:**
- Produces: `InquilinosService.obtenerSaldo` ahora retorna `{ deuda_alquiler, punitorios, deuda_gastos, total, detalle_periodos, detalle_gastos }` (recupera la forma que tenía antes de la limpieza del módulo viejo, pero leyendo de las columnas cacheadas del nuevo modelo en vez de agregar `Transaccion` a mano).

- [ ] **Step 1: Escribir el test (falla primero, contra el comportamiento actual simplificado)**

Crear `tests/services/inquilinos.service.test.ts`:

```typescript
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import { InquilinosService } from "@/services/inquilinos.service";
import { GastosService } from "@/services/gastos.service";

describe("InquilinosService.obtenerSaldo", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("incluye deuda de alquiler, punitorios pendientes y gastos a cargo del inquilino", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle 1", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino", dni_cuit: "20111111111" },
    });
    const contrato = await prisma.contrato.create({
      data: {
        id_propiedad: propiedad.id,
        id_inquilino: inquilino.id,
        fecha_inicio: new Date("2026-01-01"),
        fecha_fin: new Date("2026-12-31"),
        monto_base: 100000,
        pct_comision: 10,
      },
    });
    await prisma.periodoPago.create({
      data: {
        id_contrato: contrato.id,
        periodo: "2026-08",
        monto_cargo: 100000,
        monto_cobrado: 40000,
        punitorios_devengados: 3000,
        punitorios_cobrados: 0,
        estado: "COBRADO_PARCIAL",
        fecha_vencimiento: new Date("2026-08-10"),
      },
    });
    await GastosService.crear({
      id_propiedad: propiedad.id,
      id_contrato: contrato.id,
      concepto: "Arreglo",
      monto: 5000,
      tipo: "ARREGLO",
      cargo_a: "INQUILINO",
    });

    const saldo = await InquilinosService.obtenerSaldo(inquilino.id);

    assert.equal(saldo.deuda_alquiler, 60000);
    assert.equal(saldo.punitorios, 3000);
    assert.equal(saldo.deuda_gastos, 5000);
    assert.equal(saldo.total, 68000);
  });

  it("no incluye en detalle_periodos los períodos ya COBRADO_TOTAL", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño 2", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle 2", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino 2", dni_cuit: "20222222222" },
    });
    const contrato = await prisma.contrato.create({
      data: {
        id_propiedad: propiedad.id,
        id_inquilino: inquilino.id,
        fecha_inicio: new Date("2026-01-01"),
        fecha_fin: new Date("2026-12-31"),
        monto_base: 100000,
        pct_comision: 10,
      },
    });
    await prisma.periodoPago.create({
      data: {
        id_contrato: contrato.id,
        periodo: "2026-07",
        monto_cargo: 100000,
        monto_cobrado: 100000,
        estado: "COBRADO_TOTAL",
        fecha_vencimiento: new Date("2026-07-10"),
      },
    });
    await prisma.periodoPago.create({
      data: {
        id_contrato: contrato.id,
        periodo: "2026-08",
        monto_cargo: 100000,
        monto_cobrado: 0,
        estado: "CARGO_PENDIENTE",
        fecha_vencimiento: new Date("2026-08-10"),
      },
    });

    const saldo = await InquilinosService.obtenerSaldo(inquilino.id);

    assert.equal(saldo.detalle_periodos.length, 1);
    assert.equal(saldo.detalle_periodos[0].periodo, "2026-08");
    assert.equal(saldo.deuda_alquiler, 100000);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --import tsx --test tests/services/inquilinos.service.test.ts`
Expected: FAIL — `saldo.punitorios` y `saldo.deuda_gastos` son `undefined` (la implementación actual solo devuelve `deuda_alquiler`/`total`).

- [ ] **Step 3: Reescribir `obtenerSaldo` en `services/inquilinos.service.ts`**

Reemplazar el método `obtenerSaldo` completo por:

```typescript
  async obtenerSaldo(id: number) {
    // Solo períodos con saldo pendiente — este endpoint es "cuánto debe", no
    // historial completo. Un COBRADO_TOTAL resta 0 al cálculo pero no aporta
    // nada al detalle de una pantalla de deuda.
    const periodos = await prisma.periodoPago.findMany({
      where: {
        contrato: { id_inquilino: id },
        estado: { in: ["CARGO_PENDIENTE", "COBRADO_PARCIAL", "VENCIDO_IMPAGO"] },
      },
      include: { contrato: { select: { id: true } } },
    });

    const deudaAlquiler = periodos.reduce(
      (acc, p) => acc + (Number(p.monto_cargo) - Number(p.monto_cobrado)),
      0
    );
    const punitorios = periodos.reduce(
      (acc, p) => acc + (Number(p.punitorios_devengados) - Number(p.punitorios_cobrados)),
      0
    );

    const gastosInquilino = await prisma.gasto.findMany({
      where: { cargo_a: "INQUILINO", contrato: { id_inquilino: id } },
      include: {
        aplicaciones: true,
        contrato: { select: { id: true, propiedad: { select: { direccion: true } } } },
      },
    });

    const detalleGastos = gastosInquilino
      .map((g) => {
        const cobrado = g.aplicaciones.reduce((acc, a) => acc + Number(a.monto_aplicado), 0);
        return {
          id: g.id,
          tipo: g.tipo,
          concepto: g.concepto,
          monto: Number(g.monto) - cobrado,
          direccion: g.contrato?.propiedad.direccion ?? "",
        };
      })
      .filter((g) => g.monto > 0.009);

    const deudaGastos = detalleGastos.reduce((acc, g) => acc + g.monto, 0);

    return {
      deuda_alquiler: deudaAlquiler,
      punitorios,
      deuda_gastos: deudaGastos,
      total: deudaAlquiler + punitorios + deudaGastos,
      detalle_periodos: periodos.map((p) => ({
        id: p.id,
        periodo: p.periodo,
        monto_cargo: Number(p.monto_cargo),
        monto_cobrado: Number(p.monto_cobrado),
        debe: Number(p.monto_cargo) - Number(p.monto_cobrado),
        estado: p.estado,
        fecha_vencimiento: p.fecha_vencimiento,
      })),
      detalle_gastos: detalleGastos,
    };
  },
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --import tsx --test tests/services/inquilinos.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/inquilinos.service.ts tests/services/inquilinos.service.test.ts
git commit -m "feat: InquilinosService.obtenerSaldo incluye punitorios y gastos a cargo del inquilino"
```

---

### Task 13: `contratos.service.ts` — reincorporar gastos pendientes en `obtenerPorId`

**Files:**
- Modify: `services/contratos.service.ts`
- Create: `tests/services/contratos.service.test.ts`

**Interfaces:**
- Produces: `ContratosService.obtenerPorId` ahora incluye `gastos` (los pendientes de pago al proveedor) en el resultado.

- [ ] **Step 1: Escribir el test (falla primero)**

Crear `tests/services/contratos.service.test.ts`:

```typescript
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import { ContratosService } from "@/services/contratos.service";
import { GastosService } from "@/services/gastos.service";

describe("ContratosService.obtenerPorId", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("incluye los gastos pendientes del contrato", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle 1", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino", dni_cuit: "20111111111" },
    });
    const contrato = await prisma.contrato.create({
      data: {
        id_propiedad: propiedad.id,
        id_inquilino: inquilino.id,
        fecha_inicio: new Date("2026-01-01"),
        fecha_fin: new Date("2026-12-31"),
        monto_base: 100000,
        pct_comision: 10,
      },
    });
    await GastosService.crear({
      id_propiedad: propiedad.id,
      id_contrato: contrato.id,
      concepto: "Arreglo pendiente",
      monto: 5000,
      tipo: "ARREGLO",
      cargo_a: "PROPIETARIO",
    });

    const resultado = await ContratosService.obtenerPorId(contrato.id);

    assert.equal(resultado?.gastos.length, 1);
    assert.equal(resultado?.gastos[0].estado_pago, "PENDIENTE");
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --import tsx --test tests/services/contratos.service.test.ts`
Expected: FAIL — `resultado?.gastos` es `undefined`.

- [ ] **Step 3: Modificar `obtenerPorId` en `services/contratos.service.ts`**

Reemplazar el `include` actual de `obtenerPorId`:

```typescript
      include: {
        propiedad: { include: { propietario: true } },
        inquilino: true,
        periodos_pago: { orderBy: { periodo: "desc" }, take: 12 },
      },
```

por:

```typescript
      include: {
        propiedad: { include: { propietario: true } },
        inquilino: true,
        periodos_pago: { orderBy: { periodo: "desc" }, take: 12 },
        gastos: { where: { estado_pago: "PENDIENTE" } },
      },
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --import tsx --test tests/services/contratos.service.test.ts`
Expected: PASS

- [ ] **Step 5: Correr toda la suite de tests para verificar que nada se rompió**

Run: `npm test`
Expected: todos los tests de todas las tareas anteriores siguen en PASS.

- [ ] **Step 6: Commit**

```bash
git add services/contratos.service.ts tests/services/contratos.service.test.ts
git commit -m "feat: ContratosService.obtenerPorId reincorpora gastos pendientes"
```

---

### Task 14: cobertura de riesgo real — concurrencia y multi-entidad

**Files:**
- Create: `tests/services/concurrencia.test.ts`

**Interfaces:**
- Consumes: `PagosService.registrar` (Task 5/6), `LiquidacionesService.generarParaPropietario` (Task 9). No agrega código de producción — son tests de verificación sobre funcionalidad ya implementada, agregados a pedido explícito tras un análisis de cobertura (la suite de Tasks 1-13 es "camino feliz + 1-2 negativos por función", no exhaustiva).

Esta tarea no sigue el ciclo TDD estricto (test falla → implementar → test pasa) porque no agrega funcionalidad nueva — verifica comportamiento que el código de Tasks 5 y 9 ya debería tener. Si algún test falla, es una señal de un bug real en esa implementación, a corregir en el service correspondiente antes de dar la tarea por cerrada.

- [ ] **Step 1: Escribir los 4 tests**

Crear `tests/services/concurrencia.test.ts`:

```typescript
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import { PagosService } from "@/services/pagos.service";
import { LiquidacionesService } from "@/services/liquidaciones.service";

describe("Concurrencia y casos multi-entidad", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("dos pagos simultáneos al mismo contrato no pierden ninguna aplicación (el lock serializa)", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle 1", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino", dni_cuit: "20111111111" },
    });
    const usuario = await prisma.usuario.create({
      data: { email: "concurrencia1@test.com", password_hash: "x", rol: "ADMIN" },
    });
    const contrato = await prisma.contrato.create({
      data: {
        id_propiedad: propiedad.id,
        id_inquilino: inquilino.id,
        fecha_inicio: new Date("2026-01-01"),
        fecha_fin: new Date("2026-12-31"),
        estado: "ACTIVO",
        monto_base: 100000,
        pct_comision: 10,
      },
    });
    await prisma.periodoPago.create({
      data: {
        id_contrato: contrato.id,
        periodo: "2026-08",
        monto_cargo: 100000,
        fecha_vencimiento: new Date("2026-08-10"),
      },
    });

    await Promise.all([
      PagosService.registrar({
        id_contrato: contrato.id,
        monto_pagado: 50000,
        idempotency_key: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        id_usuario_creador: usuario.id,
      }),
      PagosService.registrar({
        id_contrato: contrato.id,
        monto_pagado: 50000,
        idempotency_key: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        id_usuario_creador: usuario.id,
      }),
    ]);

    const periodoFinal = await prisma.periodoPago.findFirstOrThrow({
      where: { id_contrato: contrato.id },
    });
    assert.equal(Number(periodoFinal.monto_cobrado), 100000);
    assert.equal(periodoFinal.estado, "COBRADO_TOTAL");

    const aplicaciones = await prisma.aplicacionPago.findMany({
      where: { periodo_pago: { id_contrato: contrato.id }, tipo_aplicacion: "CAPITAL" },
    });
    assert.equal(aplicaciones.length, 2);
  });

  it("dos generaciones simultáneas de liquidación para el mismo propietario no duplican el dinero liquidado", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño 2", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle 2", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino 2", dni_cuit: "20222222222" },
    });
    const usuario = await prisma.usuario.create({
      data: { email: "concurrencia2@test.com", password_hash: "x", rol: "ADMIN" },
    });
    const contrato = await prisma.contrato.create({
      data: {
        id_propiedad: propiedad.id,
        id_inquilino: inquilino.id,
        fecha_inicio: new Date("2026-01-01"),
        fecha_fin: new Date("2026-12-31"),
        estado: "ACTIVO",
        monto_base: 100000,
        pct_comision: 10,
      },
    });
    await prisma.periodoPago.create({
      data: {
        id_contrato: contrato.id,
        periodo: "2026-08",
        monto_cargo: 100000,
        fecha_vencimiento: new Date("2026-08-10"),
      },
    });
    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 100000,
      idempotency_key: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      id_usuario_creador: usuario.id,
    });

    const [liq1, liq2] = await Promise.all([
      LiquidacionesService.generarParaPropietario(propietario.id),
      LiquidacionesService.generarParaPropietario(propietario.id),
    ]);

    const totalBruto = Number(liq1.monto_bruto) + Number(liq2.monto_bruto);
    assert.equal(totalBruto, 100000); // ni se duplicó ni se perdió
    const conBruto = [liq1, liq2].filter((l) => Number(l.monto_bruto) > 0);
    assert.equal(conBruto.length, 1); // solo una de las dos corridas efectivamente liquidó algo
  });

  it("agrupa correctamente 2 contratos distintos de un mismo propietario en una sola liquidación", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño 3", cbu: "0000000000000000000000" },
    });
    const propiedadA = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle A", es_propia: false },
    });
    const propiedadB = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle B", es_propia: false },
    });
    const inquilinoA = await prisma.inquilino.create({
      data: { nombre: "Inquilino A", dni_cuit: "20333333333" },
    });
    const inquilinoB = await prisma.inquilino.create({
      data: { nombre: "Inquilino B", dni_cuit: "20444444444" },
    });
    const usuario = await prisma.usuario.create({
      data: { email: "concurrencia3@test.com", password_hash: "x", rol: "ADMIN" },
    });
    const contratoA = await prisma.contrato.create({
      data: {
        id_propiedad: propiedadA.id,
        id_inquilino: inquilinoA.id,
        fecha_inicio: new Date("2026-01-01"),
        fecha_fin: new Date("2026-12-31"),
        estado: "ACTIVO",
        monto_base: 100000,
        pct_comision: 10,
      },
    });
    const contratoB = await prisma.contrato.create({
      data: {
        id_propiedad: propiedadB.id,
        id_inquilino: inquilinoB.id,
        fecha_inicio: new Date("2026-01-01"),
        fecha_fin: new Date("2026-12-31"),
        estado: "ACTIVO",
        monto_base: 50000,
        pct_comision: 20,
      },
    });
    await prisma.periodoPago.create({
      data: { id_contrato: contratoA.id, periodo: "2026-08", monto_cargo: 100000, fecha_vencimiento: new Date("2026-08-10") },
    });
    await prisma.periodoPago.create({
      data: { id_contrato: contratoB.id, periodo: "2026-08", monto_cargo: 50000, fecha_vencimiento: new Date("2026-08-10") },
    });

    await PagosService.registrar({
      id_contrato: contratoA.id,
      monto_pagado: 100000,
      idempotency_key: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      id_usuario_creador: usuario.id,
    });
    await PagosService.registrar({
      id_contrato: contratoB.id,
      monto_pagado: 50000,
      idempotency_key: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      id_usuario_creador: usuario.id,
    });

    const liquidacion = await LiquidacionesService.generarParaPropietario(propietario.id);

    assert.equal(liquidacion.items.length, 2);
    assert.equal(Number(liquidacion.monto_bruto), 150000);
    // A: bruto 100000, comisión 10% = 10000; B: bruto 50000, comisión 20% = 10000. Retenciones = 20000.
    assert.equal(Number(liquidacion.retenciones), 20000);
    assert.equal(Number(liquidacion.monto_neto), 130000);

    const itemA = liquidacion.items.find((i) => i.id_contrato === contratoA.id)!;
    const itemB = liquidacion.items.find((i) => i.id_contrato === contratoB.id)!;
    assert.equal(Number(itemA.comision), 10000);
    assert.equal(Number(itemB.comision), 10000);
  });

  it("un contrato MOROSO vuelve a ACTIVO cuando el pago reduce los períodos vencidos a menos de 2", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño 4", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle 4", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino 4", dni_cuit: "20555555555" },
    });
    const usuario = await prisma.usuario.create({
      data: { email: "concurrencia4@test.com", password_hash: "x", rol: "ADMIN" },
    });
    const contrato = await prisma.contrato.create({
      data: {
        id_propiedad: propiedad.id,
        id_inquilino: inquilino.id,
        fecha_inicio: new Date("2026-01-01"),
        fecha_fin: new Date("2026-12-31"),
        estado: "MOROSO",
        monto_base: 100000,
        pct_comision: 10,
      },
    });
    const periodoVencido1 = await prisma.periodoPago.create({
      data: {
        id_contrato: contrato.id,
        periodo: "2026-06",
        monto_cargo: 100000,
        fecha_vencimiento: new Date("2026-06-10"),
        estado: "VENCIDO_IMPAGO",
      },
    });
    await prisma.periodoPago.create({
      data: {
        id_contrato: contrato.id,
        periodo: "2026-07",
        monto_cargo: 100000,
        fecha_vencimiento: new Date("2026-07-10"),
        estado: "VENCIDO_IMPAGO",
      },
    });

    // Prelación cubre el período más antiguo (junio) primero. Después de este pago
    // solo julio sigue VENCIDO_IMPAGO (1 < 2) -> el contrato vuelve a ACTIVO.
    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 100000,
      idempotency_key: "ffffffff-ffff-ffff-ffff-ffffffffffff",
      id_usuario_creador: usuario.id,
    });

    const contratoActualizado = await prisma.contrato.findUniqueOrThrow({ where: { id: contrato.id } });
    assert.equal(contratoActualizado.estado, "ACTIVO");

    const periodo1Actualizado = await prisma.periodoPago.findUniqueOrThrow({
      where: { id: periodoVencido1.id },
    });
    assert.equal(periodo1Actualizado.estado, "COBRADO_TOTAL");
  });
});
```

- [ ] **Step 2: Correr los 4 tests**

Run: `node --import tsx --test tests/services/concurrencia.test.ts`
Expected: 4/4 PASS. Si alguno falla, es un bug real en `PagosService.registrar` (Task 5/6) o `LiquidacionesService.generarParaPropietario` (Task 9) — corregirlo ahí, no en el test.

- [ ] **Step 3: Correr la suite completa**

Run: `npm test`
Expected: todos los tests de Tasks 1-13 + estos 4 nuevos, todos en PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/services/concurrencia.test.ts
git commit -m "test: cobertura de concurrencia (pagos, liquidaciones) y multi-contrato en liquidación"
```

---

## Self-Review

**1. Cobertura del spec:**
- Regla 1 (punitorios 100% inmobiliaria) → Task 5, verificado en el test de `INGRESO_PUNITORIO`.
- Regla 2 (comisión en tiempo real) → Task 5, verificado en el test de `INGRESO_COMISION`.
- Regla 3 (propiedad propia) → Task 5, verificado en el test de `INGRESO_ALQUILER_PROPIO`.
- Regla 4 (separación de cajas en egresos) → Task 8, verificado con `EGRESO_TERCEROS`/`EGRESO_OPERATIVO`.
- Regla 5 (liquidación snapshot) → Task 9.
- Regla 6 (sellado de rendición) → Task 9, verificado con el test de segunda corrida vacía.
- Regla 7 (inmutabilidad del libro diario) → Task 3 (`REVOKE`) + Task 11 (contra-asiento).
- Regla 8 (auditoría `id_usuario_creador`) → Task 2 (schema) + usado en todos los services.
- Regla 9 (idempotencia) → Task 4 + Task 5.
- Constraints de integridad (sección 4 del spec) → Task 3, con test dedicado.
- Flujo 5.1 (pago con mora parcial) → Task 5 + Task 6.
- Flujo 5.2 (liquidación) → Task 9 + Task 10.
- Flujo 5.3 (contra-asiento) → Task 11.
- Locking pesimista en liquidaciones (Global Constraints) → Task 9 y Task 10, código incluido en el `implementar` de cada una.

**2. Placeholder scan:** ninguna referencia a "TBD"/"similar a la tarea anterior" — cada step tiene el código completo.

**3. Consistencia de tipos:** `PagosService.registrar` devuelve strings decimales (`toFixed(2)`), consistente en su único punto de uso (no hay otro consumidor todavía, ya que las rutas API quedan fuera de este plan). `LiquidacionesService.generarParaPropietario` devuelve el objeto de Prisma con `items` incluido — mismo shape usado en ambos tests que lo consumen (Task 9 y Task 10 no reconsumen el shape, cada uno crea sus propios datos). Los nombres de servicio (`PagosService`, `GastosService`, `LiquidacionesService`, `TransaccionesService`, `InquilinosService`, `ContratosService`) son consistentes con el patrón ya usado en el resto del proyecto (`PropietariosService`, etc., no tocados por este plan).

**4. Consistencia del test runner:** todos los bloques de test (Tasks 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13) usan `import { describe, it, beforeEach } from "node:test"` + `import assert from "node:assert/strict"` — sin ninguna referencia residual a `vitest`. Todos los `Run:` usan `node --import tsx --test <archivo>` (o `npm test` para la suite completa en el Step final de Task 13).

---

Plan completo y guardado en `docs/superpowers/plans/2026-08-21-modelo-financiero-conciliacion.md`. Dos opciones de ejecución:

**1. Subagent-Driven (recomendado)** — despliego un subagente fresco por tarea, con revisión entre tareas, iteración rápida.

**2. Ejecución Inline** — ejecuto las tareas en esta sesión con executing-plans, por lotes con checkpoints de revisión.

¿Cuál preferís?
