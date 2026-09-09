# Servicio de Cierre de Períodos — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatizar el avance mensual de períodos de contratos (`ContratosService.avanzarPeriodo`, que hoy es 100% manual) vía un cron mensual + patrón outbox con auto-invocación encadenada, sin bloquear ni arriesgar timeout de función serverless.

**Architecture:** Un cron mensual de Vercel dispara un endpoint que encola en una tabla (`OutboxCierrePeriodo`) los contratos con período vencido, y lanza — sin esperar — una cadena de invocaciones HTTP que procesan la cola de a un registro por vez hasta vaciarla, reutilizando `ContratosService.avanzarPeriodo` tal cual ya existe.

**Tech Stack:** Next.js 16 (Route Handlers, `after()` de `next/server`), Prisma 7, PostgreSQL, `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-25-servicio-cierre-periodos-design.md`

## Global Constraints

- `Decimal` siempre se importa `from "@prisma/client/runtime/client"` — nunca `"@prisma/client"` a secas ni `"@prisma/client/runtime/library"`.
- Test runner: `node:test` + `node:assert/strict`, vía `node --import tsx --test --test-concurrency=1 {archivo}` (`npm test` ya corre así). `--test-concurrency=1` es obligatorio — la base se comparte entre archivos de test vía `cleanDatabase()`.
- Sin mocks: cada test de este proyecto corre contra la base real (Postgres local), sin ninguna librería de mocking — mismo patrón en todo el repo. Para forzar un fallo real de `avanzarPeriodo` en los tests de reintento, usar un `id_contrato` que no existe (dispara el `findUniqueOrThrow` real), no mockear la función.
- Migraciones no-interactivas: `npx prisma migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/schema.prisma --script` → escribir el resultado a mano en `prisma/migrations/<timestamp>_<nombre>/migration.sql` → aplicar con `psql "postgresql://gfrancone@localhost:5432/inmotrack" -f <archivo>` → `npx prisma migrate resolve --applied <nombre>` → `npx prisma generate`. Nunca `prisma migrate dev`.
- `cleanDatabase()` (`tests/helpers/db.ts`) trunca una lista fija de tablas — hay que agregar `outbox_cierre_periodo` a esa lista antes de escribir ningún test que dependa de ella.
- Nunca `git commit` salvo pedido explícito.
- Después de correr la suite completa de tests (trunca toda la base), resembrar con `npm run seed`.
- El servidor de dev (puerto 3000) lo reinicia el controller directamente después de cambios de schema — nunca un subagente.
- No hay `tsc`/`eslint` sueltos en este entorno — usar `npx next build` como verificación de tipos real.
- `after()` se importa `from "next/server"` (confirmado en `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` — funciona en Route Handlers).
- Períodos se comparan como strings `"YYYY-MM"` — la comparación lexicográfica (`<`, `>`, tanto en JS como en un filtro Prisma `lt`/`gt` sobre un campo String) coincide con el orden cronológico real porque el formato es de ancho fijo con cero-padding. No hace falta parsear a número para comparar dos períodos completos.

## File Structure

- **`lib/fecha.ts`** (modificar) — se agregan `calcularVencimientoPeriodo` y `hoyEnArgentina` a lo que ya existe (`partesFechaUTC`, `formatFechaLocal`).
- **`services/contratos.service.ts`** (modificar) — `activar()` usa `calcularVencimientoPeriodo` en vez de su cálculo actual (fix del bug de mes).
- **`prisma/schema.prisma`** (modificar) — modelo `OutboxCierrePeriodo`, enum `EstadoOutboxCierre`, relación inversa en `Contrato`.
- **`tests/helpers/db.ts`** (modificar) — agrega `outbox_cierre_periodo` al `TRUNCATE`.
- **`services/cierre-periodos.service.ts`** (nuevo) — `encolarContratosVencidos()` y `procesarUnaFilaDeCola()`.
- **`lib/cron-auth.ts`** (nuevo) — `validarCronSecret(req)`, compartido por los dos endpoints.
- **`app/api/v1/cron/activar-cierre-periodos/route.ts`** (nuevo) — GET, dispara el encolado + arranca la cadena.
- **`app/api/v1/cron/procesar-cola-cierre/route.ts`** (nuevo) — POST, procesa una fila y se re-dispara si queda trabajo.
- **`vercel.json`** (modificar) — define el cron mensual.

---

### Task 1: `calcularVencimientoPeriodo` + `hoyEnArgentina` en `lib/fecha.ts`, y fix del bug en `activar()`

**Files:**
- Modify: `lib/fecha.ts`
- Modify: `services/contratos.service.ts:151-158` (bloque que calcula `periodo`/`vencimiento` dentro de `activar()`)
- Test: `tests/lib/fecha.test.ts`
- Test: `tests/services/contratos.service.test.ts` (agregar un caso a la suite existente de `ContratosService.activar`)

**Interfaces:**
- Produce: `calcularVencimientoPeriodo(anio: number, mes: number): Date` — `mes` es 1-12. `hoyEnArgentina(): { anio: number; mes: number; dia: number }`. Ambas exportadas desde `lib/fecha.ts`, consumidas por `services/contratos.service.ts` (este task) y por `services/cierre-periodos.service.ts` (Tasks 3 y 4).

- [ ] **Step 1: Escribir los tests de `calcularVencimientoPeriodo` (deben fallar — la función no existe todavía)**

Agregar a `tests/lib/fecha.test.ts` (el archivo ya existe con tests de `partesFechaUTC`/`formatFechaLocal` — agregar este `describe` nuevo al final):

```ts
import { calcularVencimientoPeriodo, hoyEnArgentina } from "@/lib/fecha";

describe("calcularVencimientoPeriodo", () => {
  test("día 10 de un mes que no cae fin de semana, se queda igual", () => {
    // 10 de septiembre de 2026 es jueves.
    const v = calcularVencimientoPeriodo(2026, 9);
    assert.equal(v.getUTCFullYear(), 2026);
    assert.equal(v.getUTCMonth(), 8); // 0-indexed: setiembre
    assert.equal(v.getUTCDate(), 10);
  });

  test("si el 10 cae sábado, corre al lunes 12", () => {
    // 10 de octubre de 2026 es sábado.
    const v = calcularVencimientoPeriodo(2026, 10);
    assert.equal(v.getUTCDate(), 12);
    assert.equal(v.getUTCDay(), 1); // lunes
  });

  test("si el 10 cae domingo, corre al lunes 11", () => {
    // 10 de mayo de 2026 es domingo.
    const v = calcularVencimientoPeriodo(2026, 5);
    assert.equal(v.getUTCDate(), 11);
    assert.equal(v.getUTCDay(), 1); // lunes
  });

  test("el vencimiento es siempre del MISMO mes que se le pasa, nunca el siguiente", () => {
    const v = calcularVencimientoPeriodo(2026, 12);
    assert.equal(v.getUTCMonth(), 11); // 0-indexed: diciembre, no enero
  });
});

describe("hoyEnArgentina", () => {
  test("devuelve año, mes y día como números, coherentes entre sí", () => {
    const { anio, mes, dia } = hoyEnArgentina();
    assert.ok(anio >= 2026);
    assert.ok(mes >= 1 && mes <= 12);
    assert.ok(dia >= 1 && dia <= 31);
  });

  test("coincide con la fecha real de Argentina, no con la del proceso que corre el test", () => {
    const esperado = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    const { anio, mes, dia } = hoyEnArgentina();
    const actual = `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    assert.equal(actual, esperado);
  });
});
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `node --import tsx --test tests/lib/fecha.test.ts`
Expected: FAIL — `calcularVencimientoPeriodo`/`hoyEnArgentina` no existen en `lib/fecha.ts`.

- [ ] **Step 3: Implementar ambas funciones en `lib/fecha.ts`**

Agregar al final del archivo (que ya tiene `partesFechaUTC`/`formatFechaLocal`):

```ts
/**
 * Fecha de vencimiento de un período: día 10 del MISMO mes (mes es 1-12),
 * corrido al siguiente día hábil si cae sábado o domingo. No contempla
 * feriados argentinos — solo fines de semana (fuera de alcance).
 */
export function calcularVencimientoPeriodo(anio: number, mes: number): Date {
  let vencimiento = new Date(Date.UTC(anio, mes - 1, 10));
  const diaSemana = vencimiento.getUTCDay(); // 0=domingo, 6=sábado
  if (diaSemana === 6) vencimiento = new Date(Date.UTC(anio, mes - 1, 12));
  if (diaSemana === 0) vencimiento = new Date(Date.UTC(anio, mes - 1, 11));
  return vencimiento;
}

/**
 * Año, mes y día de HOY, en hora de Argentina — nunca del timezone del
 * proceso (Vercel corre las funciones serverless en UTC por default; usar
 * new Date().getMonth() filtraría mal entre las 21:00 y las 23:59 hora
 * Argentina del último día de cada mes, que en UTC ya es el día siguiente).
 */
export function hoyEnArgentina(): { anio: number; mes: number; dia: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (tipo: string) => Number(partes.find((p) => p.type === tipo)!.value);
  return { anio: get("year"), mes: get("month"), dia: get("day") };
}
```

- [ ] **Step 4: Correr el test de nuevo, debe pasar**

Run: `node --import tsx --test tests/lib/fecha.test.ts`
Expected: PASS, todos los tests (los que ya existían de `partesFechaUTC`/`formatFechaLocal` y los nuevos).

- [ ] **Step 5: Arreglar el bug en `ContratosService.activar()`**

En `services/contratos.service.ts`, agregar el import:

```ts
import { partesFechaUTC, calcularVencimientoPeriodo } from "@/lib/fecha";
```

Y reemplazar, dentro de `activar()`:

```ts
      const { anio, mes } = partesFechaUTC(contrato.fecha_inicio);
      const periodo = `${anio}-${String(mes).padStart(2, "0")}`;
      // Date.UTC (no el constructor local) para no repetir el mismo
      // corrimiento de timezone que se acaba de arreglar arriba.
      const vencimiento = new Date(Date.UTC(anio, mes, 10));
```

por:

```ts
      const { anio, mes } = partesFechaUTC(contrato.fecha_inicio);
      const periodo = `${anio}-${String(mes).padStart(2, "0")}`;
      const vencimiento = calcularVencimientoPeriodo(anio, mes);
```

- [ ] **Step 6: Agregar un caso a la suite de `ContratosService.activar` que verifique el fix**

Agregar dentro del `describe("ContratosService.activar", ...)` existente en `tests/services/contratos.service.test.ts`:

```ts
  it("el vencimiento del primer período es del MISMO mes de fecha_inicio, no el mes siguiente", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño Vencimiento", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle Vencimiento", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino Vencimiento", dni_cuit: "20555555555" },
    });

    const contrato = await ContratosService.crear({
      id_propiedad: propiedad.id,
      id_inquilino: inquilino.id,
      fecha_inicio: "2026-09-01",
      fecha_fin: "2027-08-31",
      monto_base: 300000,
      pct_comision: 10,
      pct_punitorio_diario: 0.1,
    });
    await ContratosService.activar(contrato.id);

    const periodo = await prisma.periodoPago.findFirst({ where: { id_contrato: contrato.id } });
    assert.equal(periodo?.periodo, "2026-09");
    // Antes del fix, esto daba "2026-10-10" (un mes después).
    assert.equal(periodo?.fecha_vencimiento.toISOString().slice(0, 10), "2026-09-10");
  });
```

- [ ] **Step 7: Correr toda la suite de `contratos.service.test.ts` para confirmar que no rompió nada existente**

Run: `node --import tsx --test --test-concurrency=1 tests/services/contratos.service.test.ts`
Expected: PASS, incluyendo el caso nuevo.

- [ ] **Step 8: Commit**

```bash
git add lib/fecha.ts services/contratos.service.ts tests/lib/fecha.test.ts tests/services/contratos.service.test.ts
git commit -m "fix: vencimiento del primer período usa el mismo mes, agrega calcularVencimientoPeriodo y hoyEnArgentina"
```

---

### Task 2: Schema — tabla `OutboxCierrePeriodo`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_outbox_cierre_periodo/migration.sql`
- Modify: `tests/helpers/db.ts`
- Test: se verifica con `npx next build` (no hay test de esquema en sí — se prueba indirectamente en el Task 3).

**Interfaces:**
- Produce: modelo Prisma `OutboxCierrePeriodo` (`id`, `id_contrato`, `estado: EstadoOutboxCierre`, `intentos: Int`, `error: String?`, `creado_en`, `procesado_en: DateTime?`) y el enum `EstadoOutboxCierre` (`PENDIENTE`/`PROCESANDO`/`COMPLETADO`/`ERROR`) — usados por `services/cierre-periodos.service.ts` (Tasks 3 y 4) vía `prisma.outboxCierrePeriodo` / `prisma.$queryRawUnsafe` sobre la tabla `outbox_cierre_periodo`.

- [ ] **Step 1: Agregar el modelo y el enum a `prisma/schema.prisma`**

Agregar la relación inversa en el modelo `Contrato` existente — buscar este bloque:

```prisma
  periodos_pago     PeriodoPago[]
  cargos            Cargo[]
  gastos            Gasto[]
  transacciones     Transaccion[]
  liquidacion_items LiquidacionItem[]

  @@map("contratos")
}
```

Y reemplazarlo por:

```prisma
  periodos_pago         PeriodoPago[]
  cargos                Cargo[]
  gastos                Gasto[]
  transacciones         Transaccion[]
  liquidacion_items     LiquidacionItem[]
  outbox_cierre_periodo OutboxCierrePeriodo[]

  @@map("contratos")
}
```

Agregar el modelo y el enum nuevos en cualquier lugar del archivo (ej. después del modelo `Contrato`):

```prisma
model OutboxCierrePeriodo {
  id           Int                @id @default(autoincrement())
  id_contrato  Int
  contrato     Contrato           @relation(fields: [id_contrato], references: [id])
  estado       EstadoOutboxCierre @default(PENDIENTE)
  intentos     Int                @default(0)
  error        String?
  creado_en    DateTime           @default(now())
  procesado_en DateTime?

  @@map("outbox_cierre_periodo")
}

enum EstadoOutboxCierre {
  PENDIENTE
  PROCESANDO
  COMPLETADO
  ERROR
}
```

- [ ] **Step 2: Generar el diff de la migración**

Run: `npx prisma migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/schema.prisma --script`
Expected: SQL con `CREATE TYPE "EstadoOutboxCierre"...`, `CREATE TABLE "outbox_cierre_periodo"...`.

- [ ] **Step 3: Escribir la migración a mano**

Crear el directorio y archivo (usar el timestamp real del momento en que se ejecuta este paso, formato `YYYYMMDDHHMMSS`):

```bash
mkdir -p "prisma/migrations/$(date -u +%Y%m%d%H%M%S)_outbox_cierre_periodo"
```

Escribir en `prisma/migrations/<ese_timestamp>_outbox_cierre_periodo/migration.sql` el contenido exacto que imprimió el Step 2 (debe ser equivalente a):

```sql
-- CreateEnum
CREATE TYPE "EstadoOutboxCierre" AS ENUM ('PENDIENTE', 'PROCESANDO', 'COMPLETADO', 'ERROR');

-- CreateTable
CREATE TABLE "outbox_cierre_periodo" (
    "id" SERIAL NOT NULL,
    "id_contrato" INTEGER NOT NULL,
    "estado" "EstadoOutboxCierre" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "procesado_en" TIMESTAMP(3),

    CONSTRAINT "outbox_cierre_periodo_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "outbox_cierre_periodo" ADD CONSTRAINT "outbox_cierre_periodo_id_contrato_fkey" FOREIGN KEY ("id_contrato") REFERENCES "contratos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 4: Aplicar la migración a la base**

Run: `psql "postgresql://gfrancone@localhost:5432/inmotrack" -f prisma/migrations/<ese_timestamp>_outbox_cierre_periodo/migration.sql`
Expected: `CREATE TYPE`, `CREATE TABLE`, `ALTER TABLE` — sin errores.

- [ ] **Step 5: Marcar la migración como aplicada y regenerar el cliente**

Run: `npx prisma migrate resolve --applied <ese_timestamp>_outbox_cierre_periodo`
Run: `npx prisma generate`
Expected: ambos sin errores; el cliente generado en `node_modules/@prisma/client` ahora expone `prisma.outboxCierrePeriodo`.

- [ ] **Step 6: Agregar la tabla a `cleanDatabase()`**

En `tests/helpers/db.ts`, el `TRUNCATE TABLE` actual lista las tablas del dominio — agregar `outbox_cierre_periodo` a la lista (en cualquier posición, no tiene FK hacia ninguna otra tabla de la lista salvo `contratos`, así que puede ir antes de `contratos`):

```ts
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      aplicaciones_pago,
      cargos,
      liquidaciones_items,
      liquidaciones,
      transacciones,
      gastos,
      idempotency_keys,
      periodos_pago,
      outbox_cierre_periodo,
      contratos,
      inquilinos,
      propiedades,
      propietarios,
      usuarios
    RESTART IDENTITY CASCADE
  `);
```

- [ ] **Step 7: Verificar que compila**

Run: `npx next build`
Expected: build limpio, sin errores de tipos (confirma que el cliente Prisma regenerado es coherente con el resto del código).

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations tests/helpers/db.ts
git commit -m "feat: agrega tabla OutboxCierrePeriodo para el servicio de cierre de períodos"
```

---

### Task 3: `CierrePeriodosService.encolarContratosVencidos()`

**Files:**
- Create: `services/cierre-periodos.service.ts`
- Test: `tests/services/cierre-periodos.service.test.ts`

**Interfaces:**
- Consumes: `hoyEnArgentina()` de `lib/fecha.ts` (Task 1).
- Produces: `CierrePeriodosService.encolarContratosVencidos(): Promise<{ encolados: number }>` — consumido por el endpoint del Task 5 (`activar-cierre-periodos`).

- [ ] **Step 1: Escribir los tests (deben fallar — el archivo no existe todavía)**

Crear `tests/services/cierre-periodos.service.test.ts`:

```ts
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import { CierrePeriodosService } from "@/services/cierre-periodos.service";
import { ContratosService } from "@/services/contratos.service";
import { hoyEnArgentina } from "@/lib/fecha";

async function crearContratoConPeriodo(estadoContrato: string, periodo: string, estadoCiclo: string) {
  const propietario = await prisma.propietario.create({
    data: { nombre: `Dueño ${periodo}-${estadoContrato}-${Math.random()}`, cbu: "0000000000000000000000" },
  });
  const propiedad = await prisma.propiedad.create({
    data: { id_propietario: propietario.id, direccion: `Calle ${Math.random()}`, es_propia: false },
  });
  const inquilino = await prisma.inquilino.create({
    data: { nombre: `Inquilino ${Math.random()}`, dni_cuit: `20${Math.floor(Math.random() * 1e9)}` },
  });
  const contrato = await prisma.contrato.create({
    data: {
      id_propiedad: propiedad.id,
      id_inquilino: inquilino.id,
      fecha_inicio: new Date("2026-01-01"),
      fecha_fin: new Date("2027-12-31"),
      monto_base: 300000,
      pct_comision: 10,
      estado: estadoContrato as never,
    },
  });
  await prisma.periodoPago.create({
    data: {
      id_contrato: contrato.id,
      periodo,
      fecha_vencimiento: new Date("2026-01-10"),
      estado_ciclo: estadoCiclo as never,
    },
  });
  return contrato;
}

describe("CierrePeriodosService.encolarContratosVencidos", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("encola un contrato ACTIVO cuyo período abierto ya terminó su mes", async () => {
    const contrato = await crearContratoConPeriodo("ACTIVO", "2026-01", "ABIERTO");

    const { encolados } = await CierrePeriodosService.encolarContratosVencidos();

    assert.equal(encolados, 1);
    const fila = await prisma.outboxCierrePeriodo.findFirst({ where: { id_contrato: contrato.id } });
    assert.ok(fila, "debe existir una fila en la cola para este contrato");
    assert.equal(fila?.estado, "PENDIENTE");
  });

  it("encola un contrato MOROSO igual que uno ACTIVO", async () => {
    await crearContratoConPeriodo("MOROSO", "2026-01", "ABIERTO");
    const { encolados } = await CierrePeriodosService.encolarContratosVencidos();
    assert.equal(encolados, 1);
  });

  it("no encola un contrato BORRADOR", async () => {
    await crearContratoConPeriodo("BORRADOR", "2026-01", "ABIERTO");
    const { encolados } = await CierrePeriodosService.encolarContratosVencidos();
    assert.equal(encolados, 0);
  });

  it("no encola un contrato cuyo período abierto es el del mes actual (no venció todavía)", async () => {
    const { anio, mes } = hoyEnArgentina();
    const periodoActual = `${anio}-${String(mes).padStart(2, "0")}`;
    await crearContratoConPeriodo("ACTIVO", periodoActual, "ABIERTO");

    const { encolados } = await CierrePeriodosService.encolarContratosVencidos();
    assert.equal(encolados, 0);
  });

  it("no duplica una fila si el contrato ya tiene una PENDIENTE sin resolver", async () => {
    const contrato = await crearContratoConPeriodo("ACTIVO", "2026-01", "ABIERTO");

    await CierrePeriodosService.encolarContratosVencidos();
    const { encolados: segundaVez } = await CierrePeriodosService.encolarContratosVencidos();

    assert.equal(segundaVez, 0);
    const filas = await prisma.outboxCierrePeriodo.findMany({ where: { id_contrato: contrato.id } });
    assert.equal(filas.length, 1);
  });

  it("sí encola de nuevo un contrato cuya fila anterior ya está COMPLETADO", async () => {
    const contrato = await crearContratoConPeriodo("ACTIVO", "2026-01", "ABIERTO");
    await prisma.outboxCierrePeriodo.create({
      data: { id_contrato: contrato.id, estado: "COMPLETADO", procesado_en: new Date() },
    });

    const { encolados } = await CierrePeriodosService.encolarContratosVencidos();
    assert.equal(encolados, 1);
  });
});
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `node --import tsx --test --test-concurrency=1 tests/services/cierre-periodos.service.test.ts`
Expected: FAIL — no existe `services/cierre-periodos.service.ts`.

- [ ] **Step 3: Implementar `encolarContratosVencidos`**

Crear `services/cierre-periodos.service.ts`:

```ts
import { prisma } from "@/lib/db";
import { hoyEnArgentina } from "@/lib/fecha";

export const CierrePeriodosService = {
  async encolarContratosVencidos() {
    const { anio, mes } = hoyEnArgentina();
    const mesActual = `${anio}-${String(mes).padStart(2, "0")}`;

    const contratos = await prisma.contrato.findMany({
      where: {
        estado: { in: ["ACTIVO", "MOROSO"] },
        periodos_pago: {
          some: { estado_ciclo: "ABIERTO", periodo: { lt: mesActual } },
        },
      },
      include: {
        outbox_cierre_periodo: { where: { estado: { in: ["PENDIENTE", "PROCESANDO"] } } },
      },
    });

    let encolados = 0;
    for (const contrato of contratos) {
      if (contrato.outbox_cierre_periodo.length > 0) continue;
      await prisma.outboxCierrePeriodo.create({
        data: { id_contrato: contrato.id, estado: "PENDIENTE" },
      });
      encolados++;
    }

    return { encolados };
  },
};
```

- [ ] **Step 4: Correr el test de nuevo, debe pasar**

Run: `node --import tsx --test --test-concurrency=1 tests/services/cierre-periodos.service.test.ts`
Expected: PASS, los 6 tests.

- [ ] **Step 5: Commit**

```bash
git add services/cierre-periodos.service.ts tests/services/cierre-periodos.service.test.ts
git commit -m "feat: CierrePeriodosService.encolarContratosVencidos"
```

---

### Task 4: `CierrePeriodosService.procesarUnaFilaDeCola()`

**Files:**
- Modify: `services/cierre-periodos.service.ts`
- Test: `tests/services/cierre-periodos.service.test.ts` (agregar un `describe` nuevo)

**Interfaces:**
- Consumes: `ContratosService.avanzarPeriodo(id_contrato, nuevoPeriodo, nuevaFechaVencimiento, id_usuario_creador?)` (ya existe, sin cambios); `calcularVencimientoPeriodo`, `hoyEnArgentina` de `lib/fecha.ts` (Task 1).
- Produces: `CierrePeriodosService.procesarUnaFilaDeCola(): Promise<{ huboTrabajo: boolean }>` — consumido por el endpoint del Task 5 (`procesar-cola-cierre`).

- [ ] **Step 1: Escribir los tests (deben fallar — la función no existe todavía)**

Agregar a `tests/services/cierre-periodos.service.test.ts`, después del `describe` de `encolarContratosVencidos`:

```ts
describe("CierrePeriodosService.procesarUnaFilaDeCola", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("devuelve huboTrabajo: false si no hay ninguna fila PENDIENTE", async () => {
    const resultado = await CierrePeriodosService.procesarUnaFilaDeCola();
    assert.equal(resultado.huboTrabajo, false);
  });

  it("avanza el período de un contrato con un solo mes de atraso, y marca la fila COMPLETADO", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño Cola 1", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle Cola 1", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino Cola 1", dni_cuit: "20666666661" },
    });
    const contrato = await ContratosService.crear({
      id_propiedad: propiedad.id,
      id_inquilino: inquilino.id,
      fecha_inicio: "2026-01-01",
      fecha_fin: "2027-12-31",
      monto_base: 300000,
      pct_comision: 10,
      pct_punitorio_diario: 0.1,
    });
    await ContratosService.activar(contrato.id);
    // El período nace en 2026-01 (por fecha_inicio) — lo dejamos así, un
    // mes atrasado respecto a cualquier "hoy" real de esta sesión.
    const fila = await prisma.outboxCierrePeriodo.create({
      data: { id_contrato: contrato.id, estado: "PENDIENTE" },
    });

    const resultado = await CierrePeriodosService.procesarUnaFilaDeCola();

    assert.equal(resultado.huboTrabajo, true);
    const filaActualizada = await prisma.outboxCierrePeriodo.findUnique({ where: { id: fila.id } });
    assert.equal(filaActualizada?.estado, "COMPLETADO");
    assert.ok(filaActualizada?.procesado_en);

    const periodoAbiertoFinal = await prisma.periodoPago.findFirst({
      where: { id_contrato: contrato.id, estado_ciclo: "ABIERTO" },
    });
    const { anio, mes } = hoyEnArgentina();
    const mesActual = `${anio}-${String(mes).padStart(2, "0")}`;
    assert.ok(
      periodoAbiertoFinal!.periodo >= mesActual,
      "el período abierto final debe estar al día (no antes del mes actual)"
    );

    const periodoEnero = await prisma.periodoPago.findFirst({
      where: { id_contrato: contrato.id, periodo: "2026-01" },
    });
    assert.equal(periodoEnero?.estado_ciclo, "CERRADO");
  });

  it("marca COMPLETADO sin llamar avanzarPeriodo si el contrato ya está al día (doble chequeo)", async () => {
    const { anio, mes } = hoyEnArgentina();
    const mesActual = `${anio}-${String(mes).padStart(2, "0")}`;

    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño Cola 2", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle Cola 2", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino Cola 2", dni_cuit: "20666666662" },
    });
    const contrato = await prisma.contrato.create({
      data: {
        id_propiedad: propiedad.id,
        id_inquilino: inquilino.id,
        fecha_inicio: new Date("2026-01-01"),
        fecha_fin: new Date("2027-12-31"),
        monto_base: 300000,
        pct_comision: 10,
        estado: "ACTIVO",
      },
    });
    await prisma.periodoPago.create({
      data: {
        id_contrato: contrato.id,
        periodo: mesActual,
        fecha_vencimiento: new Date("2026-01-10"),
        estado_ciclo: "ABIERTO",
      },
    });
    const fila = await prisma.outboxCierrePeriodo.create({
      data: { id_contrato: contrato.id, estado: "PENDIENTE" },
    });

    await CierrePeriodosService.procesarUnaFilaDeCola();

    const filaActualizada = await prisma.outboxCierrePeriodo.findUnique({ where: { id: fila.id } });
    assert.equal(filaActualizada?.estado, "COMPLETADO");
    // Sigue habiendo un solo período — no se creó ninguno nuevo.
    const periodos = await prisma.periodoPago.count({ where: { id_contrato: contrato.id } });
    assert.equal(periodos, 1);
  });

  it("reintenta hasta 3 veces y después marca ERROR, sin bloquear otras filas", async () => {
    // id_contrato inexistente → avanzarPeriodo dispara un findUniqueOrThrow real.
    const filaConError = await prisma.outboxCierrePeriodo.create({
      data: { id_contrato: 999999, estado: "PENDIENTE" },
    });

    await CierrePeriodosService.procesarUnaFilaDeCola();
    let fila = await prisma.outboxCierrePeriodo.findUnique({ where: { id: filaConError.id } });
    assert.equal(fila?.estado, "PENDIENTE");
    assert.equal(fila?.intentos, 1);

    await CierrePeriodosService.procesarUnaFilaDeCola();
    fila = await prisma.outboxCierrePeriodo.findUnique({ where: { id: filaConError.id } });
    assert.equal(fila?.estado, "PENDIENTE");
    assert.equal(fila?.intentos, 2);

    await CierrePeriodosService.procesarUnaFilaDeCola();
    fila = await prisma.outboxCierrePeriodo.findUnique({ where: { id: filaConError.id } });
    assert.equal(fila?.estado, "ERROR");
    assert.equal(fila?.intentos, 3);
    assert.ok(fila?.error);
  });

  it("toma siempre la fila PENDIENTE más vieja primero", async () => {
    const propietario = await prisma.propietario.create({
      data: { nombre: "Dueño Cola Orden", cbu: "0000000000000000000000" },
    });
    const propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle Cola Orden", es_propia: false },
    });
    const inquilino = await prisma.inquilino.create({
      data: { nombre: "Inquilino Cola Orden", dni_cuit: "20666666663" },
    });
    const contrato = await prisma.contrato.create({
      data: {
        id_propiedad: propiedad.id,
        id_inquilino: inquilino.id,
        fecha_inicio: new Date("2026-01-01"),
        fecha_fin: new Date("2027-12-31"),
        monto_base: 300000,
        pct_comision: 10,
        estado: "ACTIVO",
      },
    });
    const { anio, mes } = hoyEnArgentina();
    const mesActual = `${anio}-${String(mes).padStart(2, "0")}`;
    await prisma.periodoPago.create({
      data: {
        id_contrato: contrato.id,
        periodo: mesActual,
        fecha_vencimiento: new Date("2026-01-10"),
        estado_ciclo: "ABIERTO",
      },
    });

    const filaVieja = await prisma.outboxCierrePeriodo.create({
      data: { id_contrato: 999999, estado: "PENDIENTE" },
    });
    // Forzar que la primera quede con creado_en más viejo.
    await new Promise((r) => setTimeout(r, 5));
    await prisma.outboxCierrePeriodo.create({
      data: { id_contrato: contrato.id, estado: "PENDIENTE" },
    });

    await CierrePeriodosService.procesarUnaFilaDeCola();

    const filaViejaActualizada = await prisma.outboxCierrePeriodo.findUnique({
      where: { id: filaVieja.id },
    });
    // La más vieja (el contrato inexistente) se procesó primero — quedó
    // reintentando, no la otra fila (que sigue PENDIENTE sin tocar).
    assert.equal(filaViejaActualizada?.intentos, 1);
  });
});
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `node --import tsx --test --test-concurrency=1 tests/services/cierre-periodos.service.test.ts`
Expected: FAIL — `procesarUnaFilaDeCola` no existe todavía.

- [ ] **Step 3: Implementar `procesarUnaFilaDeCola`**

Reemplazar el contenido completo de `services/cierre-periodos.service.ts` por:

```ts
import { prisma } from "@/lib/db";
import { hoyEnArgentina, calcularVencimientoPeriodo } from "@/lib/fecha";
import { ContratosService } from "@/services/contratos.service";

const MAX_INTENTOS = 3;

interface FilaOutbox {
  id: number;
  id_contrato: number;
  intentos: number;
}

export const CierrePeriodosService = {
  async encolarContratosVencidos() {
    const { anio, mes } = hoyEnArgentina();
    const mesActual = `${anio}-${String(mes).padStart(2, "0")}`;

    const contratos = await prisma.contrato.findMany({
      where: {
        estado: { in: ["ACTIVO", "MOROSO"] },
        periodos_pago: {
          some: { estado_ciclo: "ABIERTO", periodo: { lt: mesActual } },
        },
      },
      include: {
        outbox_cierre_periodo: { where: { estado: { in: ["PENDIENTE", "PROCESANDO"] } } },
      },
    });

    let encolados = 0;
    for (const contrato of contratos) {
      if (contrato.outbox_cierre_periodo.length > 0) continue;
      await prisma.outboxCierrePeriodo.create({
        data: { id_contrato: contrato.id, estado: "PENDIENTE" },
      });
      encolados++;
    }

    return { encolados };
  },

  async procesarUnaFilaDeCola(): Promise<{ huboTrabajo: boolean }> {
    // UPDATE atómico: FOR UPDATE SKIP LOCKED en la subconsulta + re-chequeo
    // de estado en el WHERE externo — dos invocaciones concurrentes nunca
    // toman la misma fila (spec, sección 2).
    const filas = await prisma.$queryRawUnsafe<FilaOutbox[]>(`
      UPDATE outbox_cierre_periodo
      SET estado = 'PROCESANDO'
      WHERE id = (
        SELECT id FROM outbox_cierre_periodo
        WHERE estado = 'PENDIENTE'
        ORDER BY creado_en ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      AND estado = 'PENDIENTE'
      RETURNING id, id_contrato, intentos
    `);

    const fila = filas[0];
    if (!fila) return { huboTrabajo: false };

    try {
      const { anio: anioActual, mes: mesActual } = hoyEnArgentina();
      const mesActualStr = `${anioActual}-${String(mesActual).padStart(2, "0")}`;

      // Doble chequeo: releer el período abierto fresco, no confiar en el
      // estado que tenía el contrato cuando se encoló esta fila.
      let periodoAbierto = await prisma.periodoPago.findFirst({
        where: { id_contrato: fila.id_contrato, estado_ciclo: "ABIERTO" },
      });

      while (periodoAbierto && periodoAbierto.periodo < mesActualStr) {
        const [anioP, mesP] = periodoAbierto.periodo.split("-").map(Number);
        let anioSiguiente = anioP;
        let mesSiguiente = mesP + 1;
        if (mesSiguiente > 12) {
          mesSiguiente = 1;
          anioSiguiente += 1;
        }
        const nuevoPeriodo = `${anioSiguiente}-${String(mesSiguiente).padStart(2, "0")}`;
        const vencimiento = calcularVencimientoPeriodo(anioSiguiente, mesSiguiente);

        await ContratosService.avanzarPeriodo(fila.id_contrato, nuevoPeriodo, vencimiento);

        // Releer para la próxima vuelta del while — nunca calcular en base
        // al valor que ya tenía en memoria antes de esta llamada.
        periodoAbierto = await prisma.periodoPago.findFirst({
          where: { id_contrato: fila.id_contrato, estado_ciclo: "ABIERTO" },
        });
      }

      await prisma.outboxCierrePeriodo.update({
        where: { id: fila.id },
        data: { estado: "COMPLETADO", procesado_en: new Date() },
      });
    } catch (e) {
      const intentos = fila.intentos + 1;
      if (intentos < MAX_INTENTOS) {
        await prisma.outboxCierrePeriodo.update({
          where: { id: fila.id },
          data: { estado: "PENDIENTE", intentos },
        });
      } else {
        await prisma.outboxCierrePeriodo.update({
          where: { id: fila.id },
          data: { estado: "ERROR", intentos, error: String(e) },
        });
      }
    }

    return { huboTrabajo: true };
  },
};
```

- [ ] **Step 4: Correr el test de nuevo, debe pasar**

Run: `node --import tsx --test --test-concurrency=1 tests/services/cierre-periodos.service.test.ts`
Expected: PASS, los 11 tests (6 de `encolarContratosVencidos` + 5 de `procesarUnaFilaDeCola`).

- [ ] **Step 5: Correr la suite completa del proyecto**

Run: `npm test`
Expected: todos los tests pasan (esto trunca la base — resembrar después con `npm run seed`, fuera de este task, se hace al final del plan).

- [ ] **Step 6: Commit**

```bash
git add services/cierre-periodos.service.ts tests/services/cierre-periodos.service.test.ts
git commit -m "feat: CierrePeriodosService.procesarUnaFilaDeCola con doble chequeo y reintentos"
```

---

### Task 5: Endpoints del cron + `CRON_SECRET`

**Files:**
- Create: `lib/cron-auth.ts`
- Create: `app/api/v1/cron/activar-cierre-periodos/route.ts`
- Create: `app/api/v1/cron/procesar-cola-cierre/route.ts`
- Test: `tests/lib/cron-auth.test.ts`

**Interfaces:**
- Consumes: `CierrePeriodosService.encolarContratosVencidos()` y `.procesarUnaFilaDeCola()` (Tasks 3 y 4).
- Produces: `validarCronSecret(req: Request): boolean`, exportada desde `lib/cron-auth.ts`, usada por ambos route handlers.

- [ ] **Step 1: Escribir el test de `validarCronSecret` (debe fallar — no existe todavía)**

Crear `tests/lib/cron-auth.test.ts`:

```ts
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { validarCronSecret } from "@/lib/cron-auth";

describe("validarCronSecret", () => {
  const originalEnv = process.env.CRON_SECRET;

  before(() => {
    process.env.CRON_SECRET = "un-secreto-de-prueba";
  });
  after(() => {
    process.env.CRON_SECRET = originalEnv;
  });

  test("acepta el header Authorization correcto", () => {
    const req = new Request("http://localhost/api/v1/cron/activar-cierre-periodos", {
      headers: { Authorization: "Bearer un-secreto-de-prueba" },
    });
    assert.equal(validarCronSecret(req), true);
  });

  test("rechaza sin header Authorization", () => {
    const req = new Request("http://localhost/api/v1/cron/activar-cierre-periodos");
    assert.equal(validarCronSecret(req), false);
  });

  test("rechaza con el secret equivocado", () => {
    const req = new Request("http://localhost/api/v1/cron/activar-cierre-periodos", {
      headers: { Authorization: "Bearer otro-valor" },
    });
    assert.equal(validarCronSecret(req), false);
  });
});
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `node --import tsx --test tests/lib/cron-auth.test.ts`
Expected: FAIL — `lib/cron-auth.ts` no existe.

- [ ] **Step 3: Implementar `validarCronSecret`**

Crear `lib/cron-auth.ts`:

```ts
/**
 * Valida el header Authorization: Bearer <CRON_SECRET> que Vercel Cron
 * manda automáticamente en cada invocación programada, contra la
 * variable de entorno CRON_SECRET. Compartido por los dos endpoints
 * bajo /api/v1/cron/* (ya exceptuados de auth de sesión en middleware.ts).
 */
export function validarCronSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}
```

- [ ] **Step 4: Correr el test de nuevo, debe pasar**

Run: `node --import tsx --test tests/lib/cron-auth.test.ts`
Expected: PASS, los 3 tests.

- [ ] **Step 5: Crear el endpoint `activar-cierre-periodos`**

Crear `app/api/v1/cron/activar-cierre-periodos/route.ts`:

```ts
import { NextResponse } from "next/server";
import { after } from "next/server";
import { validarCronSecret } from "@/lib/cron-auth";
import { CierrePeriodosService } from "@/services/cierre-periodos.service";

export async function GET(req: Request) {
  if (!validarCronSecret(req)) {
    return NextResponse.json({ error_code: "UNAUTHORIZED", message: "Secret inválido." }, { status: 401 });
  }

  const { encolados } = await CierrePeriodosService.encolarContratosVencidos();

  // Dispara la cadena de procesamiento sin esperarla — el cron se olvida
  // apenas responde, la cola se sostiene sola desde acá en adelante.
  after(async () => {
    const secret = process.env.CRON_SECRET;
    const url = new URL("/api/v1/cron/procesar-cola-cierre", req.url);
    await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    }).catch(() => {
      // Fire-and-forget real: un error de red acá no debe tirar abajo esta
      // respuesta (que ya se mandó). La próxima corrida mensual del cron
      // vuelve a encontrar los contratos que quedaron sin procesar.
    });
  });

  return NextResponse.json({ encolados });
}
```

- [ ] **Step 6: Crear el endpoint `procesar-cola-cierre`**

Crear `app/api/v1/cron/procesar-cola-cierre/route.ts`:

```ts
import { NextResponse } from "next/server";
import { after } from "next/server";
import { validarCronSecret } from "@/lib/cron-auth";
import { CierrePeriodosService } from "@/services/cierre-periodos.service";

export async function POST(req: Request) {
  if (!validarCronSecret(req)) {
    return NextResponse.json({ error_code: "UNAUTHORIZED", message: "Secret inválido." }, { status: 401 });
  }

  const { huboTrabajo } = await CierrePeriodosService.procesarUnaFilaDeCola();

  if (huboTrabajo) {
    // Se re-dispara a sí mismo sin esperar — la próxima invocación decide
    // en su propio paso si queda más trabajo o si la cadena se apaga.
    after(async () => {
      const secret = process.env.CRON_SECRET;
      const url = new URL("/api/v1/cron/procesar-cola-cierre", req.url);
      await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
      }).catch(() => {});
    });
  }

  return NextResponse.json({ huboTrabajo });
}
```

- [ ] **Step 7: Verificar que compila**

Run: `npx next build`
Expected: build limpio, sin errores de tipos.

- [ ] **Step 8: Commit**

```bash
git add lib/cron-auth.ts app/api/v1/cron tests/lib/cron-auth.test.ts
git commit -m "feat: endpoints /api/v1/cron/activar-cierre-periodos y /procesar-cola-cierre"
```

---

### Task 6: `vercel.json`, variable de entorno, y verificación manual end-to-end

**Files:**
- Modify: `vercel.json`
- Verificar (sin archivo de test — verificación manual contra el servidor de dev, mismo patrón usado en el resto de la sesión con `curl`).

- [ ] **Step 1: Agregar el cron a `vercel.json`**

El archivo hoy es `{}` — reemplazar por:

```json
{
  "crons": [
    {
      "path": "/api/v1/cron/activar-cierre-periodos",
      "schedule": "0 6 1 * *"
    }
  ]
}
```

(Día 1 de cada mes a las 6am UTC — el endpoint usa `hoyEnArgentina()` internamente, así que la hora exacta UTC del disparo no afecta la corrección del cálculo de qué contratos están vencidos.)

- [ ] **Step 2: Setear `CRON_SECRET` en el entorno local**

Agregar una línea a `.env.local` (no versionado — cada entorno tiene su propio valor):

```
CRON_SECRET=un-secreto-local-de-desarrollo
```

- [ ] **Step 3: Reiniciar el servidor de dev**

El controller (no un subagente) mata el proceso de `next dev` en el puerto 3000 y lo levanta de nuevo, para que tome la variable de entorno nueva y el schema actualizado.

- [ ] **Step 4: Verificar que el endpoint rechaza sin el secret correcto**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/v1/cron/activar-cierre-periodos`
Expected: `401`.

- [ ] **Step 5: Verificar el flujo completo con el secret correcto**

Run:
```bash
curl -s -H "Authorization: Bearer un-secreto-local-de-desarrollo" http://localhost:3000/api/v1/cron/activar-cierre-periodos
```
Expected: `{"encolados": N}` con N ≥ 0.

Esperar 2-3 segundos (para que la cadena de `after()` termine de correr) y verificar en la base:

```bash
psql "postgresql://gfrancone@localhost:5432/inmotrack" -c "SELECT id, id_contrato, estado, intentos FROM outbox_cierre_periodo ORDER BY id;"
```

Expected: si había contratos vencidos, sus filas deben estar en `COMPLETADO` (no `PENDIENTE` ni `PROCESANDO` — si quedó alguna en esos estados varios segundos después, la cadena no se disparó correctamente, revisar el `after()`).

Verificar también que los períodos realmente avanzaron:

```bash
psql "postgresql://gfrancone@localhost:5432/inmotrack" -c "SELECT id_contrato, periodo, estado_ciclo FROM periodos_pago ORDER BY id_contrato, periodo;"
```

- [ ] **Step 6: Resembrar la base de demo**

Los steps anteriores (y la suite de tests del Task 4) modificaron/truncaron datos reales de la base de desarrollo:

```bash
psql "postgresql://gfrancone@localhost:5432/inmotrack" -c "
TRUNCATE TABLE
  aplicaciones_pago, cargos, liquidaciones_items, liquidaciones,
  transacciones, gastos, idempotency_keys, periodos_pago,
  outbox_cierre_periodo, contratos, inquilinos, propiedades,
  propietarios, usuarios
RESTART IDENTITY CASCADE;
"
npm run seed
```

- [ ] **Step 7: Commit**

```bash
git add vercel.json
git commit -m "feat: configura el cron mensual de cierre de períodos en vercel.json"
```

(`.env.local` no se commitea — está en `.gitignore`.)

---

## Self-Review

**1. Cobertura del spec:** sección 2 (decisiones) → Tasks 1, 2, 4; sección 3 (modelo de datos) → Task 2; sección 4 (flujo) → Tasks 3, 4, 5; sección 5 (impacto en código) → todas las tareas cubren cada archivo listado; sección 6 (testing) → cada task incluye sus tests; sección 7 (fuera de alcance) → no se agregó ninguna tarea de punitorios, feriados, UI de cola, ni notificaciones — correcto, coincide con el spec.

**2. Placeholders:** ninguno — todo el código de cada step está completo y es el código real a escribir, no descripciones.

**3. Consistencia de tipos:** `CierrePeriodosService.encolarContratosVencidos(): Promise<{ encolados: number }>` (Task 3) y `.procesarUnaFilaDeCola(): Promise<{ huboTrabajo: boolean }>` (Task 4) son los mismos nombres y formas que usan los endpoints del Task 5. `calcularVencimientoPeriodo(anio: number, mes: number): Date` y `hoyEnArgentina(): { anio, mes, dia }` (Task 1) se usan con esa misma firma en `services/contratos.service.ts` (Task 1) y en `services/cierre-periodos.service.ts` (Tasks 3-4). `validarCronSecret(req: Request): boolean` (Task 5) se usa igual en ambos route handlers.

## Execution Handoff

Plan completo y guardado en `docs/superpowers/plans/2026-08-25-servicio-cierre-periodos.md`. Dos opciones de ejecución:

**1. Subagent-Driven (recomendado)** — despacho un subagente fresco por tarea, reviso entre tareas, iteración rápida.

**2. Inline Execution** — ejecuto las tareas en esta misma sesión con checkpoints de revisión.

¿Cuál preferís?
