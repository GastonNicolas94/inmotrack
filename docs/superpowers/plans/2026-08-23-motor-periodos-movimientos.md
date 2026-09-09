# Motor de Períodos y Movimientos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el modelo de `PeriodoPago` (campos mutables de plata) por un modelo de `Cargo` inmutable que resuelve el saldo a favor y la deuda que se arrastra entre períodos.

**Architecture:** La deuda no necesita ningún mecanismo de arrastre — un `Cargo` con pendiente sigue existiendo indefinidamente, con su antigüedad real, y la prelación de pagos lo encuentra solo (ordenando por `creado_en` sobre todos los `Cargo` del contrato, sin filtrar por período). El saldo a favor sí necesita algo dedicado, porque no hay ningún `Cargo` al que aplicarlo: se resuelve con `PeriodoPago.credito_heredado`/`credito_al_cierre`, calculados una única vez en el momento exacto del cierre de un período — nunca antes, nunca después, nunca recalculados. Todo lo demás (pendiente de un `Cargo`, disponible de un pago) se calcula sumando `AplicacionPago`, nunca se cachea.

**Tech Stack:** Next.js 16, Prisma 7 + `@prisma/adapter-pg`, PostgreSQL, `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-23-motor-periodos-movimientos-design.md`

## Global Constraints

- **La deuda vive en los `Cargo`, sin excepción — nunca se "traslada" a ningún período ni se resume en un campo acumulado.** Un `Cargo` con pendiente > 0 de un período `CERRADO` sigue existiendo tal cual, para siempre, hasta que un pago lo cubra.
- **El único campo que se escribe una vez y nunca se recalcula es `PeriodoPago.credito_al_cierre`** (y su copia, `credito_heredado`, del período siguiente) — se calcula exactamente una vez, en `avanzarPeriodo`, en el momento del cierre. Ninguna otra tarea de este plan debe "actualizar" un monto o estado después de creado — si te encontrás necesitándolo, pará y revisá contra esta regla.
- **Un período `CERRADO` nunca se modifica, ni siquiera por un contra-asiento.** Si hay que revertir un pago de un `Cargo` de un período ya cerrado, el ajuste se refleja como un `Cargo AJUSTE` nuevo en el período `ABIERTO` actual del mismo contrato.
- `Decimal` SIEMPRE se importa `from "@prisma/client/runtime/client"` — nunca `"@prisma/client"` a secas ni `"@prisma/client/runtime/library"`.
- Test runner: `node:test` + `node:assert/strict`. Archivos individuales con `node --import tsx --test <archivo>`; suite completa con `npm test` (usa `--test-concurrency=1`, obligatorio).
- Migraciones no interactivas: `npx prisma migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/schema.prisma --script` → escribir a mano en `prisma/migrations/<timestamp>_<nombre>/migration.sql` → `psql "postgresql://gfrancone@localhost:5432/inmotrack" -f <archivo>` → `npx prisma migrate resolve --applied <nombre>`.
- El trigger de inmutabilidad de `transacciones` (`trg_transacciones_immutable`) **no se toca en ningún momento de este plan** — sigue bloqueando cualquier UPDATE/DELETE sin excepción.
- Locking pesimista con `tx.$queryRawUnsafe('SELECT ... FOR UPDATE', ...)` dentro de `prisma.$transaction` en toda operación de conciliación.
- Nada de `git commit` salvo que el usuario lo pida explícitamente — los steps de "Commit" quedan documentados para ejecución manual futura.
- `tsc`/`eslint` sueltos están rotos en este entorno (preexistente) — usar `npx next build` como verificación real de tipos.
- Este plan **reemplaza** el modelo implementado en `docs/superpowers/plans/2026-08-21-modelo-financiero-conciliacion.md` — no es aditivo. No hay datos de producción que preservar; la base de datos de desarrollo se trunca en la Task 1.

---

## File Structure

**Schema y helpers compartidos:**
- Modify: `prisma/schema.prisma`
- Modify: `tests/helpers/db.ts`
- Modify: `tests/db/constraints.test.ts`
- Modify: `lib/estado-cobranza.ts` (sin cambios de firma — ya existe, completa)
- Create: `lib/saldos.ts` (`calcularPendiente`)

**Services:**
- Modify: `services/contratos.service.ts` (`activar`, `avanzarPeriodo`, helper `abrirPeriodo`, helper `cerrarPeriodo`)
- Modify: `services/pagos.service.ts`
- Modify: `services/gastos.service.ts`
- Modify: `services/liquidaciones.service.ts`
- Modify: `services/transacciones.service.ts`
- Modify: `services/inquilinos.service.ts`

**Tests:**
- Modify: `tests/services/contratos.service.test.ts`
- Modify: `tests/services/pagos.service.test.ts`
- Modify: `tests/services/gastos.service.test.ts`
- Modify: `tests/services/liquidaciones.service.test.ts`
- Modify: `tests/services/transacciones.service.test.ts`
- Modify: `tests/services/inquilinos.service.test.ts`
- Modify: `tests/services/concurrencia.test.ts`
- Create: `tests/lib/saldos.test.ts`
- Create: `tests/services/motor-periodos.integration.test.ts`

**UI:**
- Modify: `app/api/v1/contratos/[id]/periodos/route.ts`
- Modify: `components/features/shared/BadgeEstadoPeriodo.tsx`
- Modify: `components/features/shared/PeriodoResumenRow.tsx`
- Modify: `components/features/contratos/ModalPeriodos.tsx`
- Modify: `components/features/inquilinos/ModalDeudaInquilino.tsx`
- Modify: `app/api/v1/propietarios/[id]/resumen/route.ts`
- Modify: `app/api/v1/inquilinos/[id]/saldo/route.ts`

**Seed:**
- Modify: `prisma/seed.ts`

---

### Task 1: Migración de schema — `Cargo` sin pendiente, `PeriodoPago` con `credito_heredado`/`credito_al_cierre`

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `tests/helpers/db.ts`
- Modify: `tests/db/constraints.test.ts`

**Interfaces:**
- Produces: `PeriodoPago { id, id_contrato, periodo, fecha_vencimiento, estado_ciclo: EstadoCiclo, credito_heredado: Decimal, credito_al_cierre: Decimal? }`. `Cargo { id, id_periodo, id_contrato, tipo: TipoCargo, monto: Decimal, descripcion, id_gasto, creado_en }` — sin campo de pendiente. `AplicacionPago { id, id_transaccion, id_cargo, id_liquidacion, monto_aplicado }`. `Transaccion` sin cambios.

**Nota si esta tarea ya se ejecutó antes con otra versión:** este plan pasó por varias revisiones de diseño durante su propia ejecución. Leer esta tarea de cero y no asumir el estado de ningún intento anterior — en particular, si el schema actual ya tiene campos como `monto_pendiente` en `Cargo`, `estado_cobranza` en `PeriodoPago`, `monto_sin_aplicar` en `Transaccion`, o `deuda_heredada`/`deuda_al_cierre` en `PeriodoPago`, esos son de un diseño descartado — hay que quitarlos.

- [ ] **Step 1: Truncar los datos de negocio existentes**

```bash
cd /Users/gfrancone/personal/InmoTrack
cat > .tmp-truncate.ts << 'EOF'
import { prisma } from "@/lib/db";
async function main() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      aplicaciones_pago, cargos, liquidaciones_items, liquidaciones, transacciones,
      gastos, idempotency_keys, periodos_pago, contratos, inquilinos,
      propiedades, propietarios, usuarios
    RESTART IDENTITY CASCADE
  `);
  console.log("truncado");
}
main().finally(() => prisma.$disconnect());
EOF
npx tsx .tmp-truncate.ts
rm .tmp-truncate.ts
```

Si la tabla `cargos` todavía no existe, quitarla de la lista.

- [ ] **Step 2: Editar `prisma/schema.prisma`**

Reemplazar el modelo `PeriodoPago` completo:

```prisma
model PeriodoPago {
  id                Int         @id @default(autoincrement())
  id_contrato       Int
  contrato          Contrato    @relation(fields: [id_contrato], references: [id])
  periodo           String      @db.VarChar(7)
  fecha_vencimiento DateTime    @db.Date
  estado_ciclo      EstadoCiclo @default(ABIERTO)

  credito_heredado  Decimal  @default(0) @db.Decimal(15, 2)
  credito_al_cierre Decimal? @db.Decimal(15, 2)

  cargos Cargo[]

  @@unique([id_contrato, periodo])
  @@map("periodos_pago")
}
```

Agregar el modelo `Cargo` nuevo — **sin campo de pendiente**:

```prisma
model Cargo {
  id          Int         @id @default(autoincrement())
  id_periodo  Int
  periodo     PeriodoPago @relation(fields: [id_periodo], references: [id])
  id_contrato Int
  contrato    Contrato    @relation(fields: [id_contrato], references: [id])
  tipo        TipoCargo
  monto       Decimal     @db.Decimal(15, 2)
  descripcion String?
  id_gasto    Int?
  gasto       Gasto?      @relation(fields: [id_gasto], references: [id])
  creado_en   DateTime    @default(now())

  aplicaciones AplicacionPago[]

  @@index([id_contrato])
  @@map("cargos")
}
```

Reemplazar el modelo `AplicacionPago` completo:

```prisma
model AplicacionPago {
  id             Int          @id @default(autoincrement())
  id_transaccion Int
  transaccion    Transaccion  @relation(fields: [id_transaccion], references: [id])
  id_cargo       Int
  cargo          Cargo        @relation(fields: [id_cargo], references: [id])
  id_liquidacion Int?
  liquidacion    Liquidacion? @relation(fields: [id_liquidacion], references: [id])
  monto_aplicado Decimal      @db.Decimal(15, 2)

  @@map("aplicaciones_pago")
}
```

`Transaccion` no cambia — no agregarle ningún campo.

En `Contrato`, agregar la relación inversa (junto a `periodos_pago`): `cargos Cargo[]`.

En `Gasto`, agregar `cargos Cargo[]` (y quitar la relación vieja `aplicaciones AplicacionPago[]` si todavía existe — ya no tiene campo relacional del otro lado).

Reemplazar los enums `EstadoPeriodo`/`TipoAplicacion` (eliminarlos) por:

```prisma
enum EstadoCiclo {
  FUTURO
  ABIERTO
  CERRADO
}

enum TipoCargo {
  ALQUILER
  GASTO
  PUNITORIO
  AJUSTE
}
```

`EstadoCobranza` no es tipo de ninguna columna del schema — vive como `type` de TypeScript en `lib/estado-cobranza.ts` (ya existe así, no tocar).

- [ ] **Step 3: Generar y aplicar la migración**

```bash
cd /Users/gfrancone/personal/InmoTrack
npx prisma migrate diff \
  --from-config-datasource prisma.config.ts \
  --to-schema prisma/schema.prisma \
  --script > /tmp/motor-periodos.sql
mkdir -p prisma/migrations/20260824090000_motor_periodos_final
cp /tmp/motor-periodos.sql prisma/migrations/20260824090000_motor_periodos_final/migration.sql
psql "postgresql://gfrancone@localhost:5432/inmotrack" -f prisma/migrations/20260824090000_motor_periodos_final/migration.sql
npx prisma migrate resolve --applied 20260824090000_motor_periodos_final
npx prisma generate
```

Si ya existen migraciones previas de este mismo plan con otros nombres/timestamps (de intentos anteriores descartados), usar un timestamp posterior al último existente en `prisma/migrations/`.

Expected: `prisma migrate status` reporta "up to date".

- [ ] **Step 4: Actualizar `tests/helpers/db.ts`**

Confirmar que `cargos` está en la lista de TRUNCATE (antes de `periodos_pago`):

```typescript
import { prisma } from "@/lib/db";

export async function cleanDatabase() {
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
      contratos,
      inquilinos,
      propiedades,
      propietarios,
      usuarios
    RESTART IDENTITY CASCADE
  `);
}
```

- [ ] **Step 5: Confirmar `tests/db/constraints.test.ts`**

Leer el archivo completo. Debe tener exactamente 3 tests: rechaza `Gasto` con `id_propiedad` null y `cargo_a` distinto de `INMOBILIARIA`; rechaza UPDATE directo sobre `transacciones`; un `AplicacionPago` requiere un `Cargo` existente. Si aparece algún test que referencia `tipo_aplicacion` u otro campo eliminado, quitarlo.

- [ ] **Step 6: Correr el test de constraints**

Run: `node --import tsx --test tests/db/constraints.test.ts`
Expected: PASS, 3/3.

- [ ] **Step 7: Verificar que el resto de la suite falla por las razones esperadas**

Run: `npm test`
Expected: FALLA — se repara en Tasks 3-9.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations tests/helpers/db.ts tests/db/constraints.test.ts
git commit -m "feat(db): Cargo sin pendiente cacheado, PeriodoPago con credito_heredado/credito_al_cierre"
```

---

### Task 2: `calcularEstadoCobranza` — sin cambios (ya completa)

Ya implementada (`lib/estado-cobranza.ts` + test, 4/4 pass), sin dependencia de ningún campo persistido — no requiere ningún cambio. Se invoca en el momento de leer un período (Task 11), nunca se persiste su resultado.

---

### Task 3: `lib/saldos.ts` (`calcularPendiente`) + `ContratosService.activar` + helper `abrirPeriodo`

**Files:**
- Create: `lib/saldos.ts`
- Create: `tests/lib/saldos.test.ts`
- Modify: `services/contratos.service.ts`
- Modify: `tests/services/contratos.service.test.ts`
- Modify: `app/api/v1/contratos/[id]/activar/route.ts`

**Interfaces:**
- Produces: `calcularPendiente(monto: Decimal | string | number, aplicaciones: { monto_aplicado: Decimal | string | number }[]): Decimal` — usado por Tasks 4, 5, 6, 7, 8, 9, 10, 11.
- Produces: función interna `abrirPeriodo(tx, params)` (no exportada del módulo, definida en `services/contratos.service.ts` — Task 5 edita el mismo archivo y la reusa). Firma: `abrirPeriodo(tx: Prisma.TransactionClient, params: { id_contrato: number; periodo: string; fecha_vencimiento: Date; monto_alquiler: Decimal; pct_comision: Decimal; es_propia: boolean; credito_heredado: Decimal; transaccionesConSobrante: { id: number; monto_pendiente: Decimal }[]; id_usuario_creador: number | null }): Promise<PeriodoPago>`.
- Produces: `ContratosService.activar(id: number, id_usuario_creador?: number | null): Promise<Contrato>`.

- [ ] **Step 1: Escribir `lib/saldos.ts`**

```typescript
// lib/saldos.ts
import { Decimal } from "@prisma/client/runtime/client";

/**
 * Cuánto queda de un monto original después de restarle sus aplicaciones.
 * Sirve tanto para el pendiente de un Cargo como para el disponible de un
 * pago (Transaccion) — mismo cálculo, distinto significado según el
 * contexto. Nunca se persiste el resultado.
 */
export function calcularPendiente(
  monto: Decimal | string | number,
  aplicaciones: { monto_aplicado: Decimal | string | number }[]
): Decimal {
  const aplicado = aplicaciones.reduce(
    (acc, a) => acc.plus(new Decimal(a.monto_aplicado)),
    new Decimal(0)
  );
  return new Decimal(monto).minus(aplicado);
}
```

- [ ] **Step 2: Escribir `tests/lib/saldos.test.ts`**

```typescript
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { calcularPendiente } from "@/lib/saldos";

describe("calcularPendiente", () => {
  test("sin aplicaciones, el pendiente es el monto completo", () => {
    assert.equal(calcularPendiente(600000, []).toString(), "600000");
  });

  test("resta una aplicación parcial", () => {
    assert.equal(
      calcularPendiente(600000, [{ monto_aplicado: 400000 }]).toString(),
      "200000"
    );
  });

  test("resta varias aplicaciones hasta dejarlo en cero", () => {
    assert.equal(
      calcularPendiente(600000, [{ monto_aplicado: 400000 }, { monto_aplicado: 200000 }]).toString(),
      "0"
    );
  });

  test("da negativo si las aplicaciones superan el monto (sobrante)", () => {
    assert.equal(
      calcularPendiente(600000, [{ monto_aplicado: 700000 }]).toString(),
      "-100000"
    );
  });

  test("acepta Decimal, string o number indistintamente", () => {
    assert.equal(
      calcularPendiente("600000.00", [{ monto_aplicado: "150000.50" }]).toString(),
      "449999.5"
    );
  });
});
```

- [ ] **Step 3: Correr el test para confirmar que falla, luego pasa**

Run: `node --import tsx --test tests/lib/saldos.test.ts`
Expected: primero FAIL ("Cannot find module"), luego PASS 5/5.

- [ ] **Step 4: Leer `services/contratos.service.ts` y `tests/services/contratos.service.test.ts` completos**

Confirmar el estado actual antes de reescribir.

- [ ] **Step 5: Reemplazar `services/contratos.service.ts` completo**

```typescript
// services/contratos.service.ts
import { Decimal } from "@prisma/client/runtime/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { calcularPendiente } from "@/lib/saldos";
import type { ContratoInput } from "@/schemas/contrato.schema";

async function abrirPeriodo(
  tx: Prisma.TransactionClient,
  params: {
    id_contrato: number;
    periodo: string;
    fecha_vencimiento: Date;
    monto_alquiler: Decimal;
    pct_comision: Decimal;
    es_propia: boolean;
    credito_heredado: Decimal;
    transaccionesConSobrante: { id: number; monto_pendiente: Decimal }[];
    id_usuario_creador: number | null;
  }
) {
  const periodoPago = await tx.periodoPago.create({
    data: {
      id_contrato: params.id_contrato,
      periodo: params.periodo,
      fecha_vencimiento: params.fecha_vencimiento,
      estado_ciclo: "ABIERTO",
      credito_heredado: params.credito_heredado,
    },
  });

  const cargoAlquiler = await tx.cargo.create({
    data: {
      id_periodo: periodoPago.id,
      id_contrato: params.id_contrato,
      tipo: "ALQUILER",
      monto: params.monto_alquiler,
    },
  });

  // Aplicar el sobrante identificado en el cierre del período anterior
  // (si había) contra este Cargo recién creado. La comisión se cobra
  // recién ahora, que la plata queda asignada a un alquiler real.
  for (const txnVieja of params.transaccionesConSobrante) {
    if (txnVieja.monto_pendiente.lessThanOrEqualTo(0)) continue;

    await tx.aplicacionPago.create({
      data: {
        id_transaccion: txnVieja.id,
        id_cargo: cargoAlquiler.id,
        monto_aplicado: txnVieja.monto_pendiente,
      },
    });

    const montoComision = txnVieja.monto_pendiente.times(params.pct_comision).dividedBy(100);
    if (montoComision.greaterThan(0)) {
      await tx.transaccion.create({
        data: {
          tipo: params.es_propia ? "INGRESO_ALQUILER_PROPIO" : "INGRESO_COMISION",
          caja_destino: "OPERATIVA",
          monto: montoComision,
          id_contrato: params.id_contrato,
          id_usuario_creador: params.id_usuario_creador,
        },
      });
    }
  }

  return periodoPago;
}

export const ContratosService = {
  async listar(filters?: { estado?: string; id_propietario?: number; id_inquilino?: number }) {
    return prisma.contrato.findMany({
      where: {
        ...(filters?.estado ? { estado: filters.estado as never } : {}),
        ...(filters?.id_inquilino ? { id_inquilino: filters.id_inquilino } : {}),
        ...(filters?.id_propietario
          ? { propiedad: { id_propietario: filters.id_propietario } }
          : {}),
      },
      include: {
        propiedad: { include: { propietario: true } },
        inquilino: true,
        _count: { select: { periodos_pago: true } },
      },
      orderBy: { fecha_inicio: "desc" },
    });
  },

  async obtenerPorId(id: number) {
    return prisma.contrato.findUnique({
      where: { id },
      include: {
        propiedad: { include: { propietario: true } },
        inquilino: true,
        periodos_pago: { orderBy: { periodo: "desc" }, take: 12 },
        gastos: { where: { estado_pago: "PENDIENTE" } },
      },
    });
  },

  async crear(data: ContratoInput) {
    return prisma.contrato.create({
      data: {
        id_propiedad: data.id_propiedad,
        id_inquilino: data.id_inquilino,
        fecha_inicio: new Date(data.fecha_inicio),
        fecha_fin: new Date(data.fecha_fin),
        monto_base: data.monto_base,
        pct_comision: data.pct_comision,
        pct_punitorio_diario: data.pct_punitorio_diario,
        indice_act: data.indice_act ?? null,
        meses_act: data.meses_act ?? null,
      },
    });
  },

  async activar(id: number, id_usuario_creador: number | null = null) {
    return prisma.$transaction(async (tx) => {
      const contrato = await tx.contrato.findUniqueOrThrow({
        where: { id },
        include: { propiedad: true },
      });

      if (contrato.estado !== "BORRADOR") {
        throw new Error("Solo se pueden activar contratos en estado BORRADOR.");
      }

      await tx.contrato.update({ where: { id }, data: { estado: "ACTIVO" } });

      const hoy = new Date();
      const periodo = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
      const vencimiento = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 10);

      // Primer período: nunca hay crédito heredado (no hay período anterior).
      await abrirPeriodo(tx, {
        id_contrato: id,
        periodo,
        fecha_vencimiento: vencimiento,
        monto_alquiler: new Decimal(contrato.monto_base),
        pct_comision: new Decimal(contrato.pct_comision),
        es_propia: contrato.propiedad.es_propia,
        credito_heredado: new Decimal(0),
        transaccionesConSobrante: [],
        id_usuario_creador,
      });

      return tx.contrato.findUnique({ where: { id } });
    });
  },

  async cambiarEstado(id: number, nuevoEstado: string) {
    if (nuevoEstado === "RESCINDIDO") {
      const cargos = await prisma.cargo.findMany({
        where: { id_contrato: id },
        include: { aplicaciones: true },
      });
      const hayDeuda = cargos.some((c) => calcularPendiente(c.monto, c.aplicaciones).greaterThan(0));
      if (hayDeuda) {
        throw new Error("No se puede rescindir: existen períodos con deuda pendiente.");
      }
    }

    return prisma.contrato.update({
      where: { id },
      data: { estado: nuevoEstado as never },
    });
  },
};
```

- [ ] **Step 6: Actualizar `app/api/v1/contratos/[id]/activar/route.ts`**

Leer el archivo actual primero, conservar su patrón de manejo de errores exacto. Agregar la sesión:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { ContratosService } from "@/services/contratos.service";
import { auth } from "@/lib/auth";
// ... el import de manejo de errores que ya use el archivo real ...

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const idUsuario = session?.user?.id ? Number(session.user.id) : null;

  try {
    const contrato = await ContratosService.activar(Number(id), idUsuario);
    return NextResponse.json(contrato);
  } catch (e) {
    // usar el mismo manejo de errores que ya tenía el archivo
  }
}
```

- [ ] **Step 7: Reescribir `tests/services/contratos.service.test.ts`**

Leer el archivo actual completo, conservar sus fixtures. Reemplazar los tests dependientes de campos eliminados por:

```typescript
test("activar un contrato en BORRADOR genera el período con un Cargo ALQUILER, sin crédito heredado", async () => {
  const contrato = await ContratosService.crear({
    id_propiedad: propiedad.id,
    id_inquilino: inquilino.id,
    fecha_inicio: "2026-01-01",
    fecha_fin: "2026-12-31",
    monto_base: 500000,
    pct_comision: 10,
    pct_punitorio_diario: 0.1,
  });

  await ContratosService.activar(contrato.id);

  const periodo = await prisma.periodoPago.findFirst({
    where: { id_contrato: contrato.id },
    include: { cargos: { include: { aplicaciones: true } } },
  });

  assert.equal(periodo?.estado_ciclo, "ABIERTO");
  assert.equal(Number(periodo?.credito_heredado), 0);
  assert.equal(periodo?.cargos.length, 1);
  assert.equal(periodo?.cargos[0].tipo, "ALQUILER");
  assert.equal(calcularPendiente(periodo!.cargos[0].monto, periodo!.cargos[0].aplicaciones).toNumber(), 500000);
});
```

Agregar el import `import { calcularPendiente } from "@/lib/saldos";`.

- [ ] **Step 8: Correr los tests**

Run: `node --import tsx --test tests/services/contratos.service.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/saldos.ts tests/lib/saldos.test.ts services/contratos.service.ts tests/services/contratos.service.test.ts app/api/v1/contratos/\[id\]/activar/route.ts
git commit -m "feat: calcularPendiente + ContratosService.activar sin campos cacheados"
```

---

### Task 4: `PagosService.registrar` reescrito — prelación sobre TODOS los `Cargo` del contrato, por antigüedad

**Files:**
- Modify: `services/pagos.service.ts`
- Modify: `tests/services/pagos.service.test.ts`

**Interfaces:**
- Consumes: `calcularPendiente` (Task 3).
- Produces: `PagosService.registrar(...)` misma firma pública. `PagosService.listarRecientes(limit?)` misma firma.

- [ ] **Step 1: Reemplazar el archivo completo**

```typescript
// services/pagos.service.ts
import { Decimal } from "@prisma/client/runtime/client";
import { prisma } from "@/lib/db";
import { checkIdempotencyKey, persistIdempotencyKey } from "@/lib/idempotency";
import { calcularPendiente } from "@/lib/saldos";

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

        // Lock de los cargos del contrato — evita doble aplicación en paralelo
        await tx.$queryRawUnsafe(
          `SELECT id FROM cargos WHERE id_contrato = $1 FOR UPDATE`,
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

        // Traer TODOS los cargos del contrato (de cualquier período, cerrado
        // o abierto) con sus aplicaciones, ordenados por antigüedad real —
        // así la deuda más vieja se cobra primero, sin ningún mecanismo de
        // arrastre dedicado.
        const todosCargos = await tx.cargo.findMany({
          where: { id_contrato },
          include: { aplicaciones: true, gasto: true },
          orderBy: { creado_en: "asc" },
        });

        // ── Paso 1: punitorios pendientes, más antiguos primero ──
        for (const cargo of todosCargos.filter((c) => c.tipo === "PUNITORIO")) {
          if (saldo.lessThanOrEqualTo(0)) break;
          const deuda = calcularPendiente(cargo.monto, cargo.aplicaciones);
          if (deuda.lessThanOrEqualTo(0)) continue;

          const abono = Decimal.min(saldo, deuda);
          await tx.aplicacionPago.create({
            data: { id_transaccion: txnCobro.id, id_cargo: cargo.id, monto_aplicado: abono },
          });

          saldo = saldo.minus(abono);
          aplicadoPunitorios = aplicadoPunitorios.plus(abono);
        }

        // ── Paso 2: alquiler + ajustes (capital), más antiguo primero ──
        for (const cargo of todosCargos.filter((c) => c.tipo === "ALQUILER" || c.tipo === "AJUSTE")) {
          if (saldo.lessThanOrEqualTo(0)) break;
          const deuda = calcularPendiente(cargo.monto, cargo.aplicaciones);
          if (deuda.lessThanOrEqualTo(0)) continue;

          const abono = Decimal.min(saldo, deuda);
          await tx.aplicacionPago.create({
            data: { id_transaccion: txnCobro.id, id_cargo: cargo.id, monto_aplicado: abono },
          });

          // La comisión solo aplica sobre alquiler real, no sobre ajustes
          // (un AJUSTE ya representa una corrección, no un alquiler nuevo).
          if (cargo.tipo === "ALQUILER") {
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
          }

          saldo = saldo.minus(abono);
          aplicadoCapital = aplicadoCapital.plus(abono);
        }

        // ── Paso 3: gastos a cargo del inquilino, más antiguos primero ──
        if (saldo.greaterThan(0)) {
          for (const cargo of todosCargos.filter(
            (c) => c.tipo === "GASTO" && c.gasto?.cargo_a === "INQUILINO"
          )) {
            if (saldo.lessThanOrEqualTo(0)) break;
            const deuda = calcularPendiente(cargo.monto, cargo.aplicaciones);
            if (deuda.lessThanOrEqualTo(0)) continue;

            const abono = Decimal.min(saldo, deuda);
            await tx.aplicacionPago.create({
              data: { id_transaccion: txnCobro.id, id_cargo: cargo.id, monto_aplicado: abono },
            });

            saldo = saldo.minus(abono);
          }
        }

        // El sobrante NO se persiste — queda como la diferencia entre
        // txnCobro.monto y la suma de sus aplicaciones, calculable en
        // cualquier momento (Task 5, al cerrar el período).

        // ── Evaluar transición MOROSO → ACTIVO ──
        if (contrato.estado === "MOROSO") {
          const cargosPendientesVencidos = todosCargos.filter((c) => {
            if (c.tipo !== "ALQUILER") return false;
            const pendiente = calcularPendiente(c.monto, c.aplicaciones);
            return pendiente.greaterThan(0);
          });
          const periodosConDeuda = await tx.periodoPago.findMany({
            where: {
              id: { in: cargosPendientesVencidos.map((c) => c.id_periodo) },
              fecha_vencimiento: { lt: new Date() },
            },
          });
          if (periodosConDeuda.length < 2) {
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

  async listarRecientes(limit = 50) {
    const aplicaciones = await prisma.aplicacionPago.findMany({
      where: { cargo: { tipo: "ALQUILER" } },
      include: {
        transaccion: true,
        cargo: {
          include: {
            periodo: {
              include: { contrato: { include: { inquilino: true, propiedad: true } } },
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
      contrato_id: a.cargo.periodo.id_contrato,
      inquilino: a.cargo.periodo.contrato.inquilino.nombre,
      direccion: a.cargo.periodo.contrato.propiedad.direccion,
      periodo: a.cargo.periodo.periodo,
    }));
  },
};
```

- [ ] **Step 2: Reescribir `tests/services/pagos.service.test.ts`**

Leer el archivo actual completo, conservar los fixtures y todos los casos ya cubiertos (prelación punitorio→capital→gastos, comisión, alquiler propio, transición MOROSO→ACTIVO), adaptando cada aserción a `calcularPendiente`. Agregar:

```typescript
test("un pago que excede la deuda no persiste nada — el sobrante se calcula desde la transacción", async () => {
  const contrato = await ContratosService.crear({
    id_propiedad: propiedad.id,
    id_inquilino: inquilino.id,
    fecha_inicio: "2026-01-01",
    fecha_fin: "2026-12-31",
    monto_base: 400000,
    pct_comision: 10,
    pct_punitorio_diario: 0.1,
  });
  await ContratosService.activar(contrato.id);

  const resultado = await PagosService.registrar({
    id_contrato: contrato.id,
    monto_pagado: 450000,
    idempotency_key: crypto.randomUUID(),
    id_usuario_creador: usuario.id,
  });

  assert.equal(resultado.saldo_sobrante, "50000.00");

  const txn = await prisma.transaccion.findFirst({
    where: { id_contrato: contrato.id, tipo: "INGRESO_COBRO" },
    include: { aplicaciones: true },
  });
  assert.equal(calcularPendiente(txn!.monto, txn!.aplicaciones).toNumber(), -50000);
});

test("la deuda de un Cargo de un período viejo se cobra antes que la del período actual", async () => {
  const contrato = await ContratosService.crear({
    id_propiedad: propiedad.id,
    id_inquilino: inquilino.id,
    fecha_inicio: "2026-01-01",
    fecha_fin: "2026-12-31",
    monto_base: 600000,
    pct_comision: 10,
    pct_punitorio_diario: 0.1,
  });
  await ContratosService.activar(contrato.id); // Agosto

  await PagosService.registrar({
    id_contrato: contrato.id,
    monto_pagado: 400000, // deja $200.000 pendientes en Agosto
    idempotency_key: crypto.randomUUID(),
    id_usuario_creador: usuario.id,
  });

  await ContratosService.avanzarPeriodo(contrato.id, "2026-09", new Date("2026-10-10")); // cierra Agosto, abre Septiembre

  await PagosService.registrar({
    id_contrato: contrato.id,
    monto_pagado: 300000,
    idempotency_key: crypto.randomUUID(),
    id_usuario_creador: usuario.id,
  });

  const cargoAgosto = await prisma.cargo.findFirst({
    where: { id_contrato: contrato.id, periodo: { periodo: "2026-08" } },
    include: { aplicaciones: true },
  });
  assert.equal(calcularPendiente(cargoAgosto!.monto, cargoAgosto!.aplicaciones).toNumber(), 0); // Agosto se cobró primero

  const cargoSeptiembre = await prisma.cargo.findFirst({
    where: { id_contrato: contrato.id, periodo: { periodo: "2026-09" } },
    include: { aplicaciones: true },
  });
  assert.equal(calcularPendiente(cargoSeptiembre!.monto, cargoSeptiembre!.aplicaciones).toNumber(), 500000); // 600000 - 100000 (lo que sobró de los 300000)
});
```

Agregar el import `import { calcularPendiente } from "@/lib/saldos";`.

- [ ] **Step 3: Correr los tests**

Run: `node --import tsx --test tests/services/pagos.service.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add services/pagos.service.ts tests/services/pagos.service.test.ts
git commit -m "feat: PagosService.registrar cobra por antigüedad real, sin importar el período"
```

---

### Task 5: `ContratosService.avanzarPeriodo` — cierre calcula el crédito una vez, apertura lo consume

**Files:**
- Modify: `services/contratos.service.ts` (mismo archivo de Task 3)
- Modify: `tests/services/contratos.service.test.ts`

**Interfaces:**
- Consumes: `abrirPeriodo` (helper de Task 3), `calcularPendiente` (Task 3).
- Produces: `ContratosService.avanzarPeriodo(id_contrato: number, nuevoPeriodo: string, nuevaFechaVencimiento: Date, id_usuario_creador?: number | null): Promise<Contrato>`.

- [ ] **Step 1: Agregar el método al objeto `ContratosService`**

Agregar, después de `activar` y antes de `cambiarEstado`, en `services/contratos.service.ts`:

```typescript
  async avanzarPeriodo(
    id_contrato: number,
    nuevoPeriodo: string,
    nuevaFechaVencimiento: Date,
    id_usuario_creador: number | null = null
  ) {
    return prisma.$transaction(async (tx) => {
      const contrato = await tx.contrato.findUniqueOrThrow({
        where: { id: id_contrato },
        include: { propiedad: true },
      });

      const periodoAbierto = await tx.periodoPago.findFirst({
        where: { id_contrato, estado_ciclo: "ABIERTO" },
      });

      let creditoHeredado = new Decimal(0);
      let transaccionesConSobrante: { id: number; monto_pendiente: Decimal }[] = [];

      if (periodoAbierto) {
        // ── Cierre: calcular el crédito UNA VEZ, transacción por
        // transacción — nunca comparando totales agregados (un pago puede
        // haber cubierto deuda de un Cargo de OTRO período más viejo, y
        // eso no debe contarse como "sobrante de este período"). ──
        const transaccionesDeCobro = await tx.transaccion.findMany({
          where: { tipo: "INGRESO_COBRO", id_contrato },
          include: { aplicaciones: true },
        });

        let creditoAlCierre = new Decimal(0);
        for (const t of transaccionesDeCobro) {
          const sobrante = calcularPendiente(t.monto, t.aplicaciones).negated();
          if (sobrante.greaterThan(0)) {
            creditoAlCierre = creditoAlCierre.plus(sobrante);
            transaccionesConSobrante.push({ id: t.id, monto_pendiente: sobrante });
          }
        }

        await tx.periodoPago.update({
          where: { id: periodoAbierto.id },
          data: { estado_ciclo: "CERRADO", credito_al_cierre: creditoAlCierre },
        });

        creditoHeredado = creditoAlCierre;
      }

      // ── Apertura: nace con el crédito heredado, se aplica de una vez ──
      await abrirPeriodo(tx, {
        id_contrato,
        periodo: nuevoPeriodo,
        fecha_vencimiento: nuevaFechaVencimiento,
        monto_alquiler: new Decimal(contrato.monto_base),
        pct_comision: new Decimal(contrato.pct_comision),
        es_propia: contrato.propiedad.es_propia,
        credito_heredado: creditoHeredado,
        transaccionesConSobrante,
        id_usuario_creador,
      });

      return tx.contrato.findUnique({ where: { id: id_contrato } });
    });
  },
```

**Nota sobre `calcularPendiente(...).negated()`:** `calcularPendiente(monto, aplicaciones)` da `monto - aplicado`; si `aplicado > monto` (se pagó de más), el resultado es negativo — negarlo da el sobrante positivo. Si el resultado ya es positivo o cero (no sobró nada, o incluso falta), `.negated()` da negativo o cero, y el `if (sobrante.greaterThan(0))` lo descarta correctamente.

- [ ] **Step 2: Escribir los tests del flujo completo (ejemplo 4.1 del spec, con trazabilidad)**

```typescript
test("avanzarPeriodo: sin sobrante, el período cierra con credito_al_cierre=0 y el siguiente nace sin herencia", async () => {
  const contrato = await ContratosService.crear({
    id_propiedad: propiedad.id,
    id_inquilino: inquilino.id,
    fecha_inicio: "2026-01-01",
    fecha_fin: "2026-12-31",
    monto_base: 600000,
    pct_comision: 10,
    pct_punitorio_diario: 0.1,
  });
  await ContratosService.activar(contrato.id);
  await PagosService.registrar({
    id_contrato: contrato.id,
    monto_pagado: 400000, // deja $200.000 pendientes, sin sobrante
    idempotency_key: crypto.randomUUID(),
    id_usuario_creador: usuario.id,
  });

  const agosto = await prisma.periodoPago.findFirst({ where: { id_contrato: contrato.id } });
  await ContratosService.avanzarPeriodo(contrato.id, "2026-09", new Date("2026-10-10"));

  const agostoCerrado = await prisma.periodoPago.findUnique({ where: { id: agosto!.id } });
  assert.equal(agostoCerrado?.estado_ciclo, "CERRADO");
  assert.equal(Number(agostoCerrado?.credito_al_cierre), 0);

  const septiembre = await prisma.periodoPago.findFirst({ where: { id_contrato: contrato.id, periodo: "2026-09" } });
  assert.equal(Number(septiembre?.credito_heredado), 0);

  // El Cargo de agosto sigue con su deuda, sin tocar, sin importar que cerró.
  const cargoAgosto = await prisma.cargo.findFirst({
    where: { id_periodo: agosto!.id },
    include: { aplicaciones: true },
  });
  assert.equal(calcularPendiente(cargoAgosto!.monto, cargoAgosto!.aplicaciones).toNumber(), 200000);
});

test("avanzarPeriodo: con sobrante, el crédito se arrastra y se aplica con su comisión al abrir el siguiente", async () => {
  const contrato = await ContratosService.crear({
    id_propiedad: propiedad.id,
    id_inquilino: inquilino.id,
    fecha_inicio: "2026-01-01",
    fecha_fin: "2026-12-31",
    monto_base: 600000,
    pct_comision: 10,
    pct_punitorio_diario: 0.1,
  });
  await ContratosService.activar(contrato.id);
  await PagosService.registrar({
    id_contrato: contrato.id,
    monto_pagado: 700000, // 600k al alquiler + 100k de sobrante
    idempotency_key: crypto.randomUUID(),
    id_usuario_creador: usuario.id,
  });

  await ContratosService.avanzarPeriodo(contrato.id, "2026-09", new Date("2026-10-10"));

  const agosto = await prisma.periodoPago.findFirst({ where: { id_contrato: contrato.id, periodo: "2026-08" } });
  assert.equal(Number(agosto?.credito_al_cierre), 100000);

  const septiembre = await prisma.periodoPago.findFirst({
    where: { id_contrato: contrato.id, periodo: "2026-09" },
    include: { cargos: { include: { aplicaciones: true } } },
  });
  assert.equal(Number(septiembre?.credito_heredado), 100000);
  const pendienteSeptiembre = calcularPendiente(septiembre!.cargos[0].monto, septiembre!.cargos[0].aplicaciones);
  assert.equal(pendienteSeptiembre.toNumber(), 500000); // 600k - 100k arrastrado

  const totalComisiones = await prisma.transaccion.aggregate({
    where: { id_contrato: contrato.id, tipo: "INGRESO_COMISION" },
    _sum: { monto: true },
  });
  assert.equal(Number(totalComisiones._sum.monto), 70000); // 60k (agosto) + 10k (arrastre)
});

test("avanzarPeriodo: un pago que cubre deuda de un período viejo Y sobra, arrastra solo lo que realmente sobró", async () => {
  // Reproduce el ejemplo 4.1 completo del spec: Cargo #1 (Agosto, $200k
  // pendiente) + Cargo #2 (Septiembre, $600k) cobrados con un solo pago de
  // $900.000 — $100.000 de sobrante real, no $300.000 (que sería el error
  // de comparar totales agregados en vez de por transacción).
  const contrato = await ContratosService.crear({
    id_propiedad: propiedad.id,
    id_inquilino: inquilino.id,
    fecha_inicio: "2026-01-01",
    fecha_fin: "2026-12-31",
    monto_base: 600000,
    pct_comision: 10,
    pct_punitorio_diario: 0.1,
  });
  await ContratosService.activar(contrato.id); // Agosto
  await PagosService.registrar({
    id_contrato: contrato.id,
    monto_pagado: 400000, // Agosto queda con $200.000 pendientes
    idempotency_key: crypto.randomUUID(),
    id_usuario_creador: usuario.id,
  });
  await ContratosService.avanzarPeriodo(contrato.id, "2026-09", new Date("2026-10-10")); // cierra Agosto (credito_al_cierre=0), abre Septiembre

  await PagosService.registrar({
    id_contrato: contrato.id,
    monto_pagado: 900000, // 200k a Agosto (el más viejo) + 600k a Septiembre + 100k sobrante
    idempotency_key: crypto.randomUUID(),
    id_usuario_creador: usuario.id,
  });

  await ContratosService.avanzarPeriodo(contrato.id, "2026-10", new Date("2026-11-10")); // cierra Septiembre

  const septiembre = await prisma.periodoPago.findFirst({ where: { id_contrato: contrato.id, periodo: "2026-09" } });
  assert.equal(Number(septiembre?.credito_al_cierre), 100000); // NO 300000

  const cargoAgosto = await prisma.cargo.findFirst({
    where: { id_contrato: contrato.id, periodo: { periodo: "2026-08" } },
    include: { aplicaciones: true },
  });
  assert.equal(calcularPendiente(cargoAgosto!.monto, cargoAgosto!.aplicaciones).toNumber(), 0); // se cobró bien
});
```

- [ ] **Step 3: Correr los tests**

Run: `node --import tsx --test tests/services/contratos.service.test.ts`
Expected: PASS, todos verdes.

- [ ] **Step 4: Commit**

```bash
git add services/contratos.service.ts tests/services/contratos.service.test.ts
git commit -m "feat: avanzarPeriodo calcula el crédito por transacción, no por totales agregados"
```

---

### Task 6: `GastosService` reescrito — genera `Cargo GASTO` en el período abierto

**Files:**
- Modify: `services/gastos.service.ts`
- Modify: `tests/services/gastos.service.test.ts`

**Interfaces:**
- Produces: `GastosService.crear(data)`, `marcarPagado(id, id_usuario_creador)`, `listar()` — mismas firmas públicas.

- [ ] **Step 1: Reemplazar el archivo completo**

```typescript
// services/gastos.service.ts
import { prisma } from "@/lib/db";
import type { GastoInput } from "@/schemas/gasto.schema";

export const GastosService = {
  async crear(data: GastoInput & { fecha_gasto?: string }) {
    return prisma.$transaction(async (tx) => {
      const gasto = await tx.gasto.create({
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

      if (data.id_contrato) {
        const periodoAbierto = await tx.periodoPago.findFirst({
          where: { id_contrato: data.id_contrato, estado_ciclo: "ABIERTO" },
        });

        if (periodoAbierto) {
          await tx.cargo.create({
            data: {
              id_periodo: periodoAbierto.id,
              id_contrato: data.id_contrato,
              tipo: "GASTO",
              monto: data.monto,
              id_gasto: gasto.id,
              descripcion: data.concepto,
            },
          });
        }
      }

      return gasto;
    });
  },

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

  async listar() {
    return prisma.gasto.findMany({
      include: {
        propiedad: { select: { id: true, direccion: true } },
        contrato: { select: { id: true, inquilino: { select: { nombre: true } } } },
      },
      orderBy: { id: "desc" },
    });
  },
};
```

- [ ] **Step 2: Reescribir `tests/services/gastos.service.test.ts`**

Leer el archivo actual completo, conservar los casos existentes. Agregar:

```typescript
test("crear un gasto con id_contrato genera un Cargo GASTO en el período abierto", async () => {
  const contrato = await ContratosService.crear({
    id_propiedad: propiedad.id,
    id_inquilino: inquilino.id,
    fecha_inicio: "2026-01-01",
    fecha_fin: "2026-12-31",
    monto_base: 400000,
    pct_comision: 10,
    pct_punitorio_diario: 0.1,
  });
  await ContratosService.activar(contrato.id);

  const gasto = await GastosService.crear({
    id_propiedad: propiedad.id,
    id_contrato: contrato.id,
    concepto: "Expensas",
    monto: 30000,
    tipo: "EXPENSA",
    cargo_a: "PROPIETARIO",
  });

  const cargo = await prisma.cargo.findFirst({
    where: { id_gasto: gasto.id },
    include: { aplicaciones: true },
  });
  assert.equal(cargo?.tipo, "GASTO");
  assert.equal(calcularPendiente(cargo!.monto, cargo!.aplicaciones).toNumber(), 30000);
});

test("crear un gasto sin id_contrato (propio de la inmobiliaria) no genera ningún Cargo", async () => {
  const gasto = await GastosService.crear({
    concepto: "Sueldos",
    categoria_interno: "Sueldos",
    monto: 800000,
    tipo: "OTRO",
    cargo_a: "INMOBILIARIA",
  });

  const cargo = await prisma.cargo.findFirst({ where: { id_gasto: gasto.id } });
  assert.equal(cargo, null);
});
```

Agregar el import `import { calcularPendiente } from "@/lib/saldos";`.

- [ ] **Step 3: Correr los tests**

Run: `node --import tsx --test tests/services/gastos.service.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add services/gastos.service.ts tests/services/gastos.service.test.ts
git commit -m "feat: GastosService.crear genera Cargo GASTO, sin recalcular nada"
```

---

### Task 7: `LiquidacionesService` reescrito — agrupa por `Cargo.tipo`

**Files:**
- Modify: `services/liquidaciones.service.ts`
- Modify: `tests/services/liquidaciones.service.test.ts`

**Interfaces:**
- Produces: `LiquidacionesService.listar/generarParaPropietario/aprobar/confirmarPago` — mismas firmas públicas.

- [ ] **Step 1: Reemplazar `generarParaPropietario`**

`listar`, `aprobar`, `confirmarPago` no cambian.

```typescript
  async generarParaPropietario(id_propietario: number) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        `SELECT ap.id FROM aplicaciones_pago ap
         JOIN cargos c ON c.id = ap.id_cargo
         JOIN periodos_pago pp ON pp.id = c.id_periodo
         JOIN contratos ct ON ct.id = pp.id_contrato
         JOIN propiedades prop ON prop.id = ct.id_propiedad
         WHERE c.tipo = 'ALQUILER' AND ap.id_liquidacion IS NULL
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

      const aplicaciones = await tx.aplicacionPago.findMany({
        where: {
          id_liquidacion: null,
          cargo: {
            tipo: "ALQUILER",
            periodo: { contrato: { propiedad: { id_propietario } } },
          },
        },
        include: {
          cargo: { include: { periodo: { include: { contrato: true } } } },
        },
      });

      const gastos = await tx.gasto.findMany({
        where: {
          cargo_a: "PROPIETARIO",
          id_liquidacion: null,
          propiedad: { id_propietario },
        },
      });

      const porContrato = new Map<
        number,
        { bruto: Decimal; comision: Decimal; gastos: Decimal; aplicacionIds: number[] }
      >();

      for (const aplicacion of aplicaciones) {
        const idContrato = aplicacion.cargo.periodo.id_contrato;
        const entry = porContrato.get(idContrato) ?? {
          bruto: new Decimal(0),
          comision: new Decimal(0),
          gastos: new Decimal(0),
          aplicacionIds: [] as number[],
        };
        const monto = new Decimal(aplicacion.monto_aplicado);
        const pctComision = new Decimal(aplicacion.cargo.periodo.contrato.pct_comision);
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
        data: { id_propietario, monto_bruto: montoBruto, retenciones, monto_neto: montoNeto },
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
```

- [ ] **Step 2: Reescribir `tests/services/liquidaciones.service.test.ts`**

Leer el archivo actual completo, conservar todos los casos. Ajustar fixtures para pasar por `ContratosService.activar` + `PagosService.registrar` reales.

- [ ] **Step 3: Correr los tests**

Run: `node --import tsx --test tests/services/liquidaciones.service.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add services/liquidaciones.service.ts tests/services/liquidaciones.service.test.ts
git commit -m "feat: LiquidacionesService agrupa por Cargo.tipo=ALQUILER"
```

---

### Task 8: `TransaccionesService.crearContraAsiento` reescrito — respeta períodos cerrados

**Files:**
- Modify: `services/transacciones.service.ts`
- Modify: `tests/services/transacciones.service.test.ts`

**Interfaces:**
- Produces: `TransaccionesService.crearContraAsiento/listar` — mismas firmas públicas.

- [ ] **Step 1: Reemplazar `crearContraAsiento`**

Un `Cargo` de un período `CERRADO` **nunca se toca**. Si la aplicación original pertenecía a un período ya cerrado, el ajuste va como un `Cargo AJUSTE` nuevo en el período `ABIERTO` actual del mismo contrato. Si pertenece al período que sigue abierto, se aplica directo (una `AplicacionPago` negativa contra el mismo `Cargo`).

```typescript
// services/transacciones.service.ts
import { Decimal } from "@prisma/client/runtime/client";
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
        include: {
          aplicaciones: { include: { cargo: { include: { periodo: true } } } },
        },
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
        const monto = new Decimal(aplicacion.monto_aplicado);

        if (aplicacion.cargo.periodo.estado_ciclo === "CERRADO") {
          // El período viejo no se toca. El ajuste va como deuda nueva en
          // el período ABIERTO actual del mismo contrato.
          const periodoAbierto = await tx.periodoPago.findFirst({
            where: { id_contrato: aplicacion.cargo.id_contrato, estado_ciclo: "ABIERTO" },
          });
          if (!periodoAbierto) {
            throw new Error(
              "No hay período abierto en este contrato para aplicar el ajuste del contra-asiento."
            );
          }

          const cargoAjuste = await tx.cargo.create({
            data: {
              id_periodo: periodoAbierto.id,
              id_contrato: aplicacion.cargo.id_contrato,
              tipo: "AJUSTE",
              monto,
              descripcion: `Reversa de pago aplicado a un período cerrado (${aplicacion.cargo.periodo.periodo})`,
            },
          });

          await tx.aplicacionPago.create({
            data: {
              id_transaccion: contraAsiento.id,
              id_cargo: cargoAjuste.id,
              monto_aplicado: monto,
            },
          });
        } else {
          // El período sigue abierto — se revierte directo contra el mismo Cargo.
          await tx.aplicacionPago.create({
            data: {
              id_transaccion: contraAsiento.id,
              id_cargo: aplicacion.id_cargo,
              monto_aplicado: monto.negated(),
            },
          });
        }
      }

      return contraAsiento;
    });
  },

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
};
```

**Nota sobre el `Cargo AJUSTE` de reversa:** notá que el monto de este `Cargo AJUSTE` es **positivo** (es deuda nueva que hay que volver a cobrar) y que la `AplicacionPago` que lo acompaña **también es positiva** (con `monto = monto` de la aplicación original, no negativo) — porque estamos representando "esta plata hay que volver a cobrarla", no revirtiendo una aplicación existente. El `Cargo AJUSTE` nace con esa deuda ya "aplicada" contablemente a la transacción de contra-asiento (que en sí es negativa), dejando su pendiente en 0 solo si alguien no vuelve a pagarlo — en realidad, para que el `Cargo AJUSTE` quede con pendiente > 0 y sea cobrable de nuevo, la aplicación de arriba está mal: revisar en la implementación real que el `Cargo AJUSTE` se cree SIN ninguna aplicación inicial (nace con pendiente = su monto completo), y que la única `AplicacionPago` de esta operación sea la reversa contra el `Cargo` original. Ajustar el código de este Step para que la `AplicacionPago` de la reversa apunte al **Cargo original** (negativa, como en la rama de "período abierto"), y el `Cargo AJUSTE` nuevo se cree sin ninguna aplicación — quedando pendiente por su monto completo, listo para que un pago futuro lo cubra. Verificar este detalle con un test antes de dar la tarea por completa (Step 2 de abajo).

- [ ] **Step 2: Reescribir `tests/services/transacciones.service.test.ts`**

Leer el archivo actual completo, conservar los casos existentes. Agregar:

```typescript
test("contra-asiento sobre un Cargo de un período ABIERTO revierte directo contra el mismo Cargo", async () => {
  const contrato = await ContratosService.crear({ /* ... */ monto_base: 600000, pct_comision: 10, pct_punitorio_diario: 0.1, id_propiedad: propiedad.id, id_inquilino: inquilino.id, fecha_inicio: "2026-01-01", fecha_fin: "2026-12-31" });
  await ContratosService.activar(contrato.id);
  const pago = await PagosService.registrar({
    id_contrato: contrato.id, monto_pagado: 600000,
    idempotency_key: crypto.randomUUID(), id_usuario_creador: usuario.id,
  });
  const txnCobro = await prisma.transaccion.findFirst({ where: { id_contrato: contrato.id, tipo: "INGRESO_COBRO" } });

  await TransaccionesService.crearContraAsiento({
    id_txn_origen: txnCobro!.id, comentario: "error de cobro", id_usuario_creador: usuario.id,
  });

  const cargo = await prisma.cargo.findFirst({
    where: { id_contrato: contrato.id, tipo: "ALQUILER" },
    include: { aplicaciones: true },
  });
  assert.equal(calcularPendiente(cargo!.monto, cargo!.aplicaciones).toNumber(), 600000); // vuelve a deber todo
});

test("contra-asiento sobre un Cargo de un período CERRADO genera un Cargo AJUSTE en el período abierto actual, sin tocar el viejo", async () => {
  const contrato = await ContratosService.crear({ /* ... */ monto_base: 600000, pct_comision: 10, pct_punitorio_diario: 0.1, id_propiedad: propiedad.id, id_inquilino: inquilino.id, fecha_inicio: "2026-01-01", fecha_fin: "2026-12-31" });
  await ContratosService.activar(contrato.id); // Agosto
  await PagosService.registrar({
    id_contrato: contrato.id, monto_pagado: 600000,
    idempotency_key: crypto.randomUUID(), id_usuario_creador: usuario.id,
  });
  const txnCobro = await prisma.transaccion.findFirst({ where: { id_contrato: contrato.id, tipo: "INGRESO_COBRO" } });
  await ContratosService.avanzarPeriodo(contrato.id, "2026-09", new Date("2026-10-10")); // cierra Agosto

  await TransaccionesService.crearContraAsiento({
    id_txn_origen: txnCobro!.id, comentario: "cheque rechazado", id_usuario_creador: usuario.id,
  });

  const cargoAgosto = await prisma.cargo.findFirst({
    where: { id_contrato: contrato.id, periodo: { periodo: "2026-08" } },
    include: { aplicaciones: true },
  });
  assert.equal(calcularPendiente(cargoAgosto!.monto, cargoAgosto!.aplicaciones).toNumber(), 0); // Agosto no se tocó

  const cargoAjuste = await prisma.cargo.findFirst({
    where: { id_contrato: contrato.id, tipo: "AJUSTE", periodo: { periodo: "2026-09" } },
    include: { aplicaciones: true },
  });
  assert.ok(cargoAjuste, "debe existir un Cargo AJUSTE en Septiembre");
  assert.equal(calcularPendiente(cargoAjuste!.monto, cargoAjuste!.aplicaciones).toNumber(), 600000); // deuda nueva, cobrable
});
```

- [ ] **Step 3: Corregir la implementación según lo que digan los tests**

Correr los tests del Step 2 primero para confirmar el comportamiento exacto necesario, y ajustar el código del Step 1 (la nota de ese Step ya señala el punto exacto a corregir: el `Cargo AJUSTE` nace sin aplicaciones propias, con pendiente igual a su monto completo; la reversa real va como `AplicacionPago` negativa contra el `Cargo` **original** del período cerrado — pero como ese `Cargo` no se puede "tocar" con una aplicación nueva sin que afecte su pendiente calculado... resolver esto así: el `Cargo` original SÍ puede recibir `AplicacionPago` nuevas sin que eso viole "el período cerrado no se modifica" — lo que no se modifica es el **período** en sí (su `estado_ciclo`/`credito_al_cierre`) y el `Cargo.monto` (que nunca cambia). Agregar una `AplicacionPago` a un `Cargo` de un período cerrado technically no modifica el período ni el Cargo, cambia el pendiente CALCULADO de ese Cargo — pero el spec (sección 4.3) es explícito en que el ajuste debe reflejarse en el período ABIERTO actual, no en el cerrado. Implementar entonces así: la `AplicacionPago` de reversa (negativa) va contra el **Cargo AJUSTE nuevo** creado en el período abierto — no contra el Cargo original. El `Cargo AJUSTE` nace con `monto` = el monto a revertir, y la reversa se resuelve dejando ese `Cargo AJUSTE` con pendiente = su monto completo desde el principio, sin ninguna aplicación — listo para cobrarse de nuevo. No hace falta ninguna aplicación adicional contra el Cargo original del período cerrado en absoluto.)

Run: `node --import tsx --test tests/services/transacciones.service.test.ts`
Expected: PASS, todos verdes, una vez corregido.

- [ ] **Step 4: Commit**

```bash
git add services/transacciones.service.ts tests/services/transacciones.service.test.ts
git commit -m "feat: contra-asiento respeta períodos cerrados, genera Cargo AJUSTE en el abierto"
```

---

### Task 9: `InquilinosService.obtenerSaldo` reescrito sobre `Cargo` calculado

**Files:**
- Modify: `services/inquilinos.service.ts`
- Modify: `tests/services/inquilinos.service.test.ts`

**Interfaces:**
- Produces: `InquilinosService.obtenerSaldo(id)` — mismo shape de retorno público.

- [ ] **Step 1: Reemplazar `obtenerSaldo`**

```typescript
  async obtenerSaldo(id: number) {
    const cargos = await prisma.cargo.findMany({
      where: { contrato: { id_inquilino: id } },
      include: {
        aplicaciones: true,
        periodo: { select: { periodo: true, fecha_vencimiento: true } },
        contrato: { select: { id: true, propiedad: { select: { direccion: true } } } },
      },
    });

    const cargosConPendiente = cargos
      .map((c) => ({ ...c, pendiente: calcularPendiente(c.monto, c.aplicaciones) }))
      .filter((c) => c.pendiente.greaterThan(0));

    const cargosAlquiler = cargosConPendiente.filter((c) => c.tipo === "ALQUILER" || c.tipo === "AJUSTE");
    const cargosPunitorio = cargosConPendiente.filter((c) => c.tipo === "PUNITORIO");
    const cargosGasto = cargosConPendiente.filter((c) => c.tipo === "GASTO");

    const deudaAlquiler = cargosAlquiler.reduce((acc, c) => acc + c.pendiente.toNumber(), 0);
    const punitorios = cargosPunitorio.reduce((acc, c) => acc + c.pendiente.toNumber(), 0);
    const deudaGastos = cargosGasto.reduce((acc, c) => acc + c.pendiente.toNumber(), 0);

    return {
      deuda_alquiler: deudaAlquiler,
      punitorios,
      deuda_gastos: deudaGastos,
      total: deudaAlquiler + punitorios + deudaGastos,
      detalle_periodos: [...cargosAlquiler, ...cargosPunitorio].map((c) => ({
        id: c.id,
        periodo: c.periodo.periodo,
        tipo: c.tipo,
        monto: Number(c.monto),
        pendiente: c.pendiente.toNumber(),
        fecha_vencimiento: c.periodo.fecha_vencimiento,
      })),
      detalle_gastos: cargosGasto.map((c) => ({
        id: c.id,
        concepto: c.descripcion ?? "",
        monto: c.pendiente.toNumber(),
        direccion: c.contrato.propiedad.direccion,
      })),
    };
  },
```

Agregar el import `import { calcularPendiente } from "@/lib/saldos";`.

- [ ] **Step 2: Reescribir `tests/services/inquilinos.service.test.ts`**

Leer el archivo completo, conservar el caso que blinda que `detalle_periodos` no incluye cargos ya cubiertos. Agregar el caso de dos contratos del mismo inquilino sumando deuda.

- [ ] **Step 3: Correr los tests**

Run: `node --import tsx --test tests/services/inquilinos.service.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add services/inquilinos.service.ts tests/services/inquilinos.service.test.ts
git commit -m "feat: InquilinosService.obtenerSaldo calculado sobre Cargo"
```

---

### Task 10: Test de integración de extremo a extremo + concurrencia

**Files:**
- Create: `tests/services/motor-periodos.integration.test.ts`
- Modify: `tests/services/concurrencia.test.ts`

**Interfaces:**
- Consumes: `ContratosService`, `PagosService`, `InquilinosService`, `calcularPendiente`.

- [ ] **Step 1: Escribir el test de integración completo (ejemplo 4.1 del spec, con la trazabilidad de sección 4.1)**

```typescript
// tests/services/motor-periodos.integration.test.ts
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import { calcularPendiente } from "@/lib/saldos";
import { ContratosService } from "@/services/contratos.service";
import { PagosService } from "@/services/pagos.service";
import { InquilinosService } from "@/services/inquilinos.service";

describe("Motor de períodos — integración de extremo a extremo", () => {
  let propiedad: { id: number };
  let inquilino: { id: number };
  let usuario: { id: number };

  beforeEach(async () => {
    await cleanDatabase();
    const propietario = await prisma.propietario.create({
      data: { nombre: "Carlos", cbu: "0".repeat(22) },
    });
    propiedad = await prisma.propiedad.create({
      data: { id_propietario: propietario.id, direccion: "Calle Falsa 123" },
    });
    inquilino = await prisma.inquilino.create({
      data: { nombre: "María", dni_cuit: "20-12345678-9" },
    });
    usuario = await prisma.usuario.create({
      data: { email: "test@test.com", password_hash: "x", rol: "ADMIN" },
    });
  });

  test("trazabilidad completa del ejemplo del spec: deuda vieja + sobrante correctamente distinguidos", async () => {
    const contrato = await ContratosService.crear({
      id_propiedad: propiedad.id,
      id_inquilino: inquilino.id,
      fecha_inicio: "2026-01-01",
      fecha_fin: "2026-12-31",
      monto_base: 600000,
      pct_comision: 10,
      pct_punitorio_diario: 0.1,
    });
    await ContratosService.activar(contrato.id, usuario.id); // Agosto

    await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 400000,
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });
    await ContratosService.avanzarPeriodo(contrato.id, "2026-09", new Date("2026-10-10"), usuario.id);

    const t2 = await PagosService.registrar({
      id_contrato: contrato.id,
      monto_pagado: 900000,
      idempotency_key: crypto.randomUUID(),
      id_usuario_creador: usuario.id,
    });
    assert.equal(t2.saldo_sobrante, "100000.00");

    await ContratosService.avanzarPeriodo(contrato.id, "2026-10", new Date("2026-11-10"), usuario.id);

    const cargoOctubre = await prisma.cargo.findFirst({
      where: { id_contrato: contrato.id, periodo: { periodo: "2026-10" } },
      include: { aplicaciones: true },
    });
    assert.equal(calcularPendiente(cargoOctubre!.monto, cargoOctubre!.aplicaciones).toNumber(), 500000);

    const saldo = await InquilinosService.obtenerSaldo(inquilino.id);
    assert.equal(saldo.deuda_alquiler, 500000); // solo Octubre — Agosto y Septiembre ya están en $0
  });
});
```

- [ ] **Step 2: Adaptar `tests/services/concurrencia.test.ts`**

Leer el archivo completo, conservar los 4 casos existentes, ajustar cada aserción de campos eliminados a `calcularPendiente`.

- [ ] **Step 3: Correr ambos archivos**

Run: `node --import tsx --test tests/services/motor-periodos.integration.test.ts tests/services/concurrencia.test.ts`
Expected: PASS.

- [ ] **Step 4: Correr la suite completa**

Run: `npm test`
Expected: PASS, todos los archivos en verde.

- [ ] **Step 5: Commit**

```bash
git add tests/services/motor-periodos.integration.test.ts tests/services/concurrencia.test.ts
git commit -m "test: integración de extremo a extremo y concurrencia del motor de períodos"
```

---

### Task 11: Adaptar la UI y rutas que leían campos eliminados

**Files:**
- Modify: `app/api/v1/contratos/[id]/periodos/route.ts`
- Modify: `components/features/shared/BadgeEstadoPeriodo.tsx`
- Modify: `components/features/shared/PeriodoResumenRow.tsx`
- Modify: `components/features/contratos/ModalPeriodos.tsx`
- Modify: `components/features/inquilinos/ModalDeudaInquilino.tsx`
- Modify: `app/api/v1/propietarios/[id]/resumen/route.ts`
- Modify: `app/api/v1/inquilinos/[id]/saldo/route.ts`

**Interfaces:**
- Consumes: `calcularEstadoCobranza` (Task 2), `calcularPendiente` (Task 3).

**Nota de alcance:** correr `grep -rln "PeriodoResumenRow" --include="*.tsx"` antes de dar la tarea por completa — ya se verificó que son dos consumidores (`ModalPeriodos.tsx`, `ModalDeudaInquilino.tsx`).

- [ ] **Step 1: Reemplazar `app/api/v1/contratos/[id]/periodos/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calcularPendiente } from "@/lib/saldos";
import { calcularEstadoCobranza } from "@/lib/estado-cobranza";
import { Decimal } from "@prisma/client/runtime/client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const periodos = await prisma.periodoPago.findMany({
    where: { id_contrato: Number(id) },
    include: { cargos: { include: { aplicaciones: true } } },
    orderBy: { periodo: "desc" },
  });

  const respuesta = periodos.map((p) => {
    const montoTotal = p.cargos.reduce((acc, c) => acc.plus(new Decimal(c.monto)), new Decimal(0));
    const montoPendiente = p.cargos.reduce(
      (acc, c) => acc.plus(calcularPendiente(c.monto, c.aplicaciones)),
      new Decimal(0)
    );
    const vencido = p.fecha_vencimiento < new Date();
    const estado_cobranza = calcularEstadoCobranza({ montoTotal, montoPendiente, vencido });

    return {
      id: p.id,
      periodo: p.periodo,
      fecha_vencimiento: p.fecha_vencimiento,
      estado_ciclo: p.estado_ciclo,
      credito_heredado: p.credito_heredado,
      estado_cobranza,
      cargos: p.cargos.map((c) => ({
        id: c.id,
        tipo: c.tipo,
        monto: c.monto,
        pendiente: calcularPendiente(c.monto, c.aplicaciones),
      })),
    };
  });

  return NextResponse.json(respuesta);
}
```

- [ ] **Step 2: Reemplazar `BadgeEstadoPeriodo.tsx`**

```tsx
import { EstadoBadge } from "./EstadoBadge";

const COLORES: Record<string, string> = {
  PENDIENTE: "bg-status-neutral-bg text-status-neutral",
  PARCIAL: "bg-status-warning-bg text-status-warning",
  TOTAL: "bg-status-success-bg text-status-success",
  VENCIDO: "bg-status-danger-bg text-status-danger",
};

/** Estado de cobranza de un período de pago (alquiler o expensa). Compartido entre contratos e inquilinos. */
export function BadgeEstadoPeriodo({ estado }: { estado: string }) {
  return <EstadoBadge valor={estado} colores={COLORES} />;
}
```

- [ ] **Step 3: Reemplazar `PeriodoResumenRow.tsx`**

Representa un `Cargo` individual — un período puede tener más de uno:

```tsx
import { BadgeEstadoPeriodo } from "./BadgeEstadoPeriodo";

function fmt(n: number | string | null | undefined) {
  return Number(n ?? 0).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });
}

const ETIQUETA_TIPO: Record<string, string> = {
  ALQUILER: "Alquiler",
  GASTO: "Gasto",
  PUNITORIO: "Punitorio",
  AJUSTE: "Ajuste",
};

/** Fila de resumen de un Cargo (alquiler, gasto, punitorio o ajuste) dentro de un período de pago. */
export function PeriodoResumenRow({
  periodo,
  estado,
  tipo,
  monto,
  pendiente,
  fechaVencimiento,
}: {
  periodo: string;
  estado?: string;
  tipo?: string;
  monto: number | string;
  pendiente: number | string;
  fechaVencimiento?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-mono font-medium">{periodo}</span>
        {tipo && <span className="text-xs text-muted-foreground">{ETIQUETA_TIPO[tipo] ?? tipo}</span>}
        {estado && <BadgeEstadoPeriodo estado={estado} />}
      </div>
      <div className="space-y-0.5 text-right text-xs">
        <div className="text-muted-foreground">
          Monto: <span className="font-mono">{fmt(monto)}</span>
        </div>
        {Number(pendiente) > 0 ? (
          <div className="font-semibold text-status-danger">
            Debe: <span className="font-mono">{fmt(pendiente)}</span>
          </div>
        ) : (
          <div className="text-status-success">Cobrado</div>
        )}
        {fechaVencimiento && (
          <div className="text-xs text-muted-foreground">
            Vence: {new Date(fechaVencimiento).toLocaleDateString("es-AR")}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Reemplazar `ModalPeriodos.tsx`**

```tsx
"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PeriodoResumenRow } from "@/components/features/shared/PeriodoResumenRow";

interface Cargo {
  id: number;
  tipo: string;
  monto: number | string;
  pendiente: number | string;
}

interface Periodo {
  id: number;
  periodo: string;
  estado_cobranza: string;
  fecha_vencimiento: string;
  cargos: Cargo[];
}

interface Props {
  contratoId: number;
  label: string;
}

export function ModalPeriodos({ contratoId, label }: Props) {
  const [open, setOpen] = useState(false);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/v1/contratos/${contratoId}/periodos`)
      .then((r) => r.json())
      .then(setPeriodos)
      .finally(() => setLoading(false));
  }, [open, contratoId]);

  const filas = periodos.flatMap((p) => p.cargos.map((c) => ({ ...c, periodo: p })));

  return (
    <>
      <Button size="sm" variant="ghost" className="text-xs" onClick={() => setOpen(true)}>
        Períodos
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Períodos de pago</DialogTitle>
            <p className="text-sm text-muted-foreground">{label}</p>
          </DialogHeader>

          {loading ? (
            <p className="text-center py-6 text-muted-foreground text-sm">Cargando...</p>
          ) : filas.length === 0 ? (
            <p className="text-center py-6 text-muted-foreground text-sm">
              No hay períodos generados.
            </p>
          ) : (
            <div className="space-y-2">
              {filas.map((c) => (
                <PeriodoResumenRow
                  key={c.id}
                  periodo={c.periodo.periodo}
                  estado={c.periodo.estado_cobranza}
                  tipo={c.tipo}
                  monto={c.monto}
                  pendiente={c.pendiente}
                  fechaVencimiento={c.periodo.fecha_vencimiento}
                />
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 5: Reemplazar `app/api/v1/inquilinos/[id]/saldo/route.ts`**

Leer el archivo actual primero — si ya delega directo a `InquilinosService.obtenerSaldo(id)` sin lógica propia, no necesita ningún cambio.

- [ ] **Step 6: Reemplazar `ModalDeudaInquilino.tsx`**

```tsx
"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PeriodoResumenRow } from "@/components/features/shared/PeriodoResumenRow";

function fmt(n: number | null | undefined) {
  return (n ?? 0).toLocaleString("es-AR", {
    style: "currency", currency: "ARS", maximumFractionDigits: 0,
  });
}

interface Saldo {
  deuda_alquiler: number;
  total: number;
  detalle_periodos: {
    id: number;
    periodo: string;
    tipo: string;
    monto: number;
    pendiente: number;
    fecha_vencimiento: string;
  }[];
}

export function ModalDeudaInquilino({
  inquilinoId,
  nombre,
}: {
  inquilinoId: number;
  nombre: string;
}) {
  const [open, setOpen] = useState(false);
  const [saldo, setSaldo] = useState<Saldo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/v1/inquilinos/${inquilinoId}/saldo`)
      .then((r) => r.json())
      .then(setSaldo)
      .finally(() => setLoading(false));
  }, [open, inquilinoId]);

  return (
    <>
      <Button size="sm" variant="ghost" className="text-xs" onClick={() => setOpen(true)}>
        Ver deuda
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Deuda total — {nombre}</DialogTitle>
          </DialogHeader>

          {loading && <p className="text-center py-6 text-muted-foreground text-sm">Cargando...</p>}

          {!loading && saldo && (
            <div className="space-y-5">
              <div className="rounded-xl border border-border p-2 text-center">
                <p className="text-xs text-muted-foreground">TOTAL</p>
                <p className="text-sm font-mono mt-0.5 font-bold">{fmt(saldo.total)}</p>
              </div>

              {saldo.total === 0 && (
                <p className="text-center text-sm text-status-success py-2">
                  ✓ Sin deuda pendiente.
                </p>
              )}

              {saldo.detalle_periodos.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Alquiler, ajustes y punitorios por período</h3>
                  {saldo.detalle_periodos.map((p) => (
                    <PeriodoResumenRow
                      key={p.id}
                      periodo={p.periodo}
                      tipo={p.tipo}
                      monto={p.monto}
                      pendiente={p.pendiente}
                      fechaVencimiento={p.fecha_vencimiento}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 7: Reemplazar `app/api/v1/propietarios/[id]/resumen/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import { calcularPendiente } from "@/lib/saldos";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const propietario = await prisma.propietario.findUnique({
    where: { id: Number(id) },
    include: {
      propiedades: {
        include: {
          contratos: {
            where: { estado: { in: ["ACTIVO", "MOROSO"] } },
            include: {
              inquilino: true,
              cargos: { include: { aplicaciones: true } },
            },
          },
        },
      },
    },
  });

  if (!propietario) return errorResponse("NOT_FOUND", "Propietario no encontrado.", 404);

  const contratosActivos = propietario.propiedades.flatMap((p) => p.contratos);

  const deudaTotal = contratosActivos
    .flatMap((c) => c.cargos)
    .reduce((acc, c) => acc + calcularPendiente(c.monto, c.aplicaciones).toNumber(), 0);

  return NextResponse.json({
    id: propietario.id,
    nombre: propietario.nombre,
    contratos_activos: contratosActivos.length,
    deuda_inquilinos: deudaTotal,
  });
}
```

- [ ] **Step 8: Verificar que compila**

Run: `npx next build`
Expected: compila sin errores de tipos.

- [ ] **Step 9: Commit**

```bash
git add app/api/v1/contratos/\[id\]/periodos/route.ts components/features/shared/BadgeEstadoPeriodo.tsx components/features/shared/PeriodoResumenRow.tsx components/features/contratos/ModalPeriodos.tsx components/features/inquilinos/ModalDeudaInquilino.tsx app/api/v1/propietarios/\[id\]/resumen/route.ts app/api/v1/inquilinos/\[id\]/saldo/route.ts
git commit -m "feat(ui): estado_cobranza calculado en las rutas, pendiente por Cargo individual"
```

---

### Task 12: Reescribir `prisma/seed.ts`

**Files:**
- Modify: `prisma/seed.ts`

**Interfaces:**
- Consumes: `ContratosService.crear/activar/avanzarPeriodo`, `PagosService.registrar`, `GastosService.crear/marcarPagado`, `LiquidacionesService.generarParaPropietario/aprobar`.

- [ ] **Step 1: Reescribir el seed completo**

Mismo dataset conceptual que la versión anterior (4 usuarios con roles, 3 propietarios, 4 propiedades, 4 inquilinos, 4 contratos), incluyendo el caso de crédito arrastrado:

```typescript
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { ContratosService } from "@/services/contratos.service";
import { PagosService } from "@/services/pagos.service";
import { GastosService } from "@/services/gastos.service";
import { LiquidacionesService } from "@/services/liquidaciones.service";

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 12);

  const admin = await prisma.usuario.upsert({
    where: { email: "admin@inmotrack.com" },
    update: {},
    create: { email: "admin@inmotrack.com", password_hash: passwordHash, rol: "ADMIN" },
  });
  await prisma.usuario.upsert({
    where: { email: "empleado1@inmotrack.com" },
    update: {},
    create: {
      email: "empleado1@inmotrack.com",
      password_hash: passwordHash,
      rol: "EMPLEADO",
      puede_aprobar_liquidaciones: true,
    },
  });
  await prisma.usuario.upsert({
    where: { email: "empleado2@inmotrack.com" },
    update: {},
    create: { email: "empleado2@inmotrack.com", password_hash: passwordHash, rol: "EMPLEADO" },
  });
  await prisma.usuario.upsert({
    where: { email: "auditor@inmotrack.com" },
    update: {},
    create: { email: "auditor@inmotrack.com", password_hash: passwordHash, rol: "AUDITOR" },
  });

  console.log("✅ Usuarios: admin / empleado1 / empleado2 / auditor @inmotrack.com — contraseña admin123");

  const contratosExistentes = await prisma.contrato.count();
  if (contratosExistentes > 0) {
    console.log("ℹ️  Ya hay contratos cargados — se omite el resto del seed de datos de demo.");
    return;
  }

  const carlos = await prisma.propietario.create({
    data: { nombre: "Carlos Méndez", cbu: "0170099220000012345678" },
  });
  const laura = await prisma.propietario.create({
    data: { nombre: "Laura Giménez", cbu: "0720123188000098765432" },
  });
  const inmobiliaria = await prisma.propietario.create({
    data: { nombre: "InmoTrack Inmobiliaria", cbu: "0000003100000011112222" },
  });

  const propA = await prisma.propiedad.create({
    data: { id_propietario: carlos.id, direccion: "Av. Corrientes 1234, 4°A, CABA", es_propia: false },
  });
  const propB = await prisma.propiedad.create({
    data: { id_propietario: carlos.id, direccion: "Av. Santa Fe 4567, 2°B, CABA", es_propia: false },
  });
  const propC = await prisma.propiedad.create({
    data: { id_propietario: laura.id, direccion: "Av. Rivadavia 8900, PB, CABA", es_propia: false },
  });
  const propD = await prisma.propiedad.create({
    data: { id_propietario: inmobiliaria.id, direccion: "Defensa 350, 1°C, San Telmo, CABA", es_propia: true },
  });

  const juan = await prisma.inquilino.create({
    data: { nombre: "Juan Pérez", dni_cuit: "20-30111222-3", email: "juan.perez@example.com" },
  });
  const maria = await prisma.inquilino.create({
    data: { nombre: "María Rodríguez", dni_cuit: "27-28444555-9", email: "maria.rodriguez@example.com" },
  });
  const pedro = await prisma.inquilino.create({
    data: { nombre: "Pedro Sánchez", dni_cuit: "20-25666777-1", email: "pedro.sanchez@example.com" },
  });
  const ana = await prisma.inquilino.create({
    data: { nombre: "Ana López", dni_cuit: "27-31888999-4", email: "ana.lopez@example.com" },
  });

  // Contrato 1: BORRADOR
  await ContratosService.crear({
    id_propiedad: propA.id,
    id_inquilino: juan.id,
    fecha_inicio: "2026-09-01",
    fecha_fin: "2027-08-31",
    monto_base: 350000,
    pct_comision: 8,
    pct_punitorio_diario: 0.1,
  });

  // Contrato 2: ACTIVO — paga de más, el sobrante se arrastra a un período nuevo.
  const contrato2 = await ContratosService.crear({
    id_propiedad: propB.id,
    id_inquilino: maria.id,
    fecha_inicio: "2026-01-01",
    fecha_fin: "2027-12-31",
    monto_base: 420000,
    pct_comision: 10,
    pct_punitorio_diario: 0.1,
  });
  await ContratosService.activar(contrato2.id, admin.id);
  await PagosService.registrar({
    id_contrato: contrato2.id,
    monto_pagado: 470000, // 420.000 de alquiler + 50.000 de sobrante
    idempotency_key: crypto.randomUUID(),
    id_usuario_creador: admin.id,
  });
  await ContratosService.avanzarPeriodo(contrato2.id, "2026-09", new Date("2026-10-10"), admin.id);

  // Contrato 3: MOROSO — deuda de agosto sin pagar, sigue viva en su Cargo.
  const contrato3 = await ContratosService.crear({
    id_propiedad: propC.id,
    id_inquilino: pedro.id,
    fecha_inicio: "2025-06-01",
    fecha_fin: "2027-05-31",
    monto_base: 380000,
    pct_comision: 8,
    pct_punitorio_diario: 0.15,
  });
  await ContratosService.activar(contrato3.id, admin.id);
  const periodoAgosto = await prisma.periodoPago.findFirst({ where: { id_contrato: contrato3.id } });
  await prisma.periodoPago.update({
    where: { id: periodoAgosto!.id },
    data: { fecha_vencimiento: new Date("2026-07-10") },
  });
  await ContratosService.avanzarPeriodo(contrato3.id, "2026-09", new Date("2026-10-10"), admin.id);
  await prisma.contrato.update({ where: { id: contrato3.id }, data: { estado: "MOROSO" } });

  // Contrato 4: ACTIVO, propiedad propia — pct_comision 100 para ver INGRESO_ALQUILER_PROPIO.
  const contrato4 = await ContratosService.crear({
    id_propiedad: propD.id,
    id_inquilino: ana.id,
    fecha_inicio: "2026-03-01",
    fecha_fin: "2027-02-28",
    monto_base: 300000,
    pct_comision: 100,
    pct_punitorio_diario: 0.1,
  });
  await ContratosService.activar(contrato4.id, admin.id);
  await PagosService.registrar({
    id_contrato: contrato4.id,
    monto_pagado: 300000,
    idempotency_key: crypto.randomUUID(),
    id_usuario_creador: admin.id,
  });

  console.log("✅ Contratos: 1 BORRADOR, 1 ACTIVO con crédito arrastrado, 1 MOROSO, 1 ACTIVO (propiedad propia)");

  await GastosService.crear({
    id_propiedad: propA.id,
    concepto: "Reparación de cañería",
    monto: 45000,
    tipo: "ARREGLO",
    cargo_a: "PROPIETARIO",
  });

  const gastoExpensas = await GastosService.crear({
    id_propiedad: propB.id,
    id_contrato: contrato2.id,
    concepto: "Expensas septiembre 2026",
    monto: 32000,
    tipo: "EXPENSA",
    cargo_a: "PROPIETARIO",
  });
  await GastosService.marcarPagado(gastoExpensas.id, admin.id);

  await GastosService.crear({
    concepto: "Sueldos administrativos",
    categoria_interno: "Sueldos",
    monto: 850000,
    tipo: "OTRO",
    cargo_a: "INMOBILIARIA",
  });

  console.log("✅ Gastos: 1 pendiente (propietario), 1 pagado (propietario), 1 propio de la inmobiliaria");

  const liquidacion = await LiquidacionesService.generarParaPropietario(carlos.id);
  await LiquidacionesService.aprobar(liquidacion.id, admin.id);

  console.log("✅ Liquidación generada y aprobada para Carlos Méndez");
  console.log("\n🌱 Seed de demo completo.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

**Nota sobre el Contrato 3 (MOROSO):** ya no hace falta crear un `Cargo`/período "de julio vencido" a mano — activar el contrato genera el período de agosto normal; se le cambia la `fecha_vencimiento` a una fecha pasada (10/07) para simular que venció, y se avanza a septiembre sin pagar nada, dejando el `Cargo` de agosto con toda su deuda intacta y vencida — exactamente el comportamiento real del sistema, sin necesitar atajos manuales.

- [ ] **Step 2: Truncar y correr el seed**

```bash
cd /Users/gfrancone/personal/InmoTrack
cat > .tmp-truncate.ts << 'EOF'
import { prisma } from "@/lib/db";
async function main() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE aplicaciones_pago, cargos, liquidaciones_items, liquidaciones,
      transacciones, gastos, idempotency_keys, periodos_pago, contratos,
      inquilinos, propiedades, propietarios, usuarios
    RESTART IDENTITY CASCADE
  `);
}
main().finally(() => prisma.$disconnect());
EOF
npx tsx .tmp-truncate.ts && rm .tmp-truncate.ts
npx tsx prisma/seed.ts
```

Expected: los 4 mensajes de éxito, sin errores.

- [ ] **Step 3: Verificar `npx next build`**

Run: `npx next build`
Expected: compila limpio.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat: seed de demo reescrito sobre el modelo final de Cargo/credito_heredado"
```

---

## Self-Review

**1. Cobertura del spec:**
- Sección 2 (deuda sin arrastre, crédito con mecanismo dedicado) → Task 3 (`abrirPeriodo`) + Task 4 (prelación por antigüedad real) + Task 5 (`avanzarPeriodo`, cálculo del cierre).
- Sección 3.1 (`PeriodoPago` con `credito_heredado`/`credito_al_cierre`) → Task 1.
- Sección 3.2 (`Cargo` sin campo de pendiente, vive indefinidamente) → Task 1.
- Sección 3.5 (`calcularPendiente`) → Task 3, consumida en Tasks 4-11.
- Sección 4.1 (ejemplo completo con trazabilidad) → Task 5 (tests que reproducen exactamente los mismos números) + Task 10 (integración).
- Sección 4.2 (mecanismo exacto de cierre/apertura, el bug de "totales agregados" corregido) → Task 5.
- Sección 4.3 (contra-asiento respeta períodos cerrados) → Task 8.
- Sección 6 (impacto en código) → Tasks 3-9 (services), Task 11 (UI), Task 12 (seed).

**2. Placeholder scan:** el único punto marcado explícitamente como "corregir según lo que digan los tests" es la Task 8 Step 1 — no es un placeholder de lógica de negocio sin resolver, es una advertencia deliberada de un detalle de implementación sutil (a qué Cargo apunta la `AplicacionPago` de reversa) que el propio Step deja resuelto en prosa antes de que el implementador escriba una sola línea, y que los tests del Step 2 verifican de forma concreta.

**3. Consistencia de tipos:** `calcularPendiente` (Task 3) misma firma en Tasks 4-11. `abrirPeriodo` (Task 3) y su uso en `avanzarPeriodo` (Task 5) comparten la firma exacta, incluyendo el parámetro nuevo `transaccionesConSobrante`. El shape de `InquilinosService.obtenerSaldo` mantiene los mismos nombres de campo de nivel superior que las versiones anteriores del plan.

**4. Historial de esta revisión:** este plan fue reescrito varias veces durante su propia ejecución, cada vez por una razón de diseño real encontrada en el camino (el trigger de inmutabilidad, la redundancia de cachear `Cargo.monto_pendiente`, la pérdida de antigüedad al fusionar deuda en un campo acumulado, el bug de comparar totales agregados en vez de por transacción al calcular el crédito). Un ejecutor que retome este plan debe tratar cualquier trabajo previo sobre versiones anteriores del schema como descartado.

---

Plan reescrito y guardado en `docs/superpowers/plans/2026-08-23-motor-periodos-movimientos.md`. Retomando la ejecución Subagent-Driven desde Task 1 con este diseño final.
