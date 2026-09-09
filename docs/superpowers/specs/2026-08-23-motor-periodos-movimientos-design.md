# Motor de Períodos y Movimientos — Design Spec

## 1. Contexto y problema

El modelo financiero actual (`docs/superpowers/specs/2026-08-21-modelo-financiero-conciliacion-design.md`, ya implementado) tiene dos gaps reales, detectados al usar el sistema con datos de demo:

1. **Saldo a favor perdido.** `PagosService.registrar` calcula un `saldo_sobrante` cuando un pago excede la deuda aplicable, pero solo lo devuelve como dato informativo en la respuesta — no se persiste en ningún lado. Esa plata queda contablemente en el aire.
2. **Deuda que no se arrastra entre períodos.** `PeriodoPago` es una fila independiente por mes por contrato, con `monto_cargo` fijo. Si un mes queda con deuda, esa deuda vive aislada en ese período — no hay ningún mecanismo que la traslade al período siguiente.

## 2. Decisiones de diseño (revisadas varias veces durante el diseño — este documento refleja la versión final)

- **La deuda no necesita ningún mecanismo de arrastre.** Un `Cargo` que queda con pendiente > 0 simplemente sigue existiendo, vinculado a su período de origen y con su fecha de creación real — sin importar que ese período haya cerrado. La prelación de pagos (`PagosService.registrar`) ya ordena por antigüedad sobre **todos** los `Cargo` del contrato, sin filtrar por período, así que la deuda vieja se cobra primero automáticamente. Esto además preserva la antigüedad real de cada porción de deuda (necesaria para calcular intereses diferenciados: una deuda de hace 3 meses no es lo mismo que una de hace 1 mes) — fusionar todo en un campo acumulado la perdería.
- **El saldo a favor sí necesita un mecanismo dedicado**, porque ahí no hay ningún `Cargo` pendiente al que aplicarle nada — es plata que ya entró y quedó sin destino. Se resuelve con dos campos en `PeriodoPago` (`credito_heredado`/`credito_al_cierre`, ver sección 3.1) calculados **una única vez, en el momento del cierre del período** — nunca recalculados después, nunca consultados en cada lectura.
- **El saldo a favor queda atado al contrato**, no cruza a otro contrato del mismo inquilino — es la consecuencia aceptada de resolver el arrastre a nivel de `PeriodoPago` en vez de a nivel de `Inquilino`. Si en el futuro se necesita que cruce entre contratos, es una extensión posterior, no parte de este spec.
- **Principio rector para todo lo demás:** nunca actualizar un hecho financiero ya registrado — solo agregar hechos nuevos que cambian su interpretación. `Transaccion` y `Cargo` no tienen ningún campo que se mute después de creado. El único campo que se escribe una vez y después nunca más es `PeriodoPago.credito_al_cierre` — y es exactamente eso: un hecho que se cristaliza en el momento preciso del cierre, no un valor que se recalcula.
- **Se rechaza un balance materializado tipo `ContractAccount`/`OpenObligation` como tablas aparte** (ver sección 6) — el volumen real de este negocio no lo justifica.

## 3. Modelo de datos

### 3.1 `PeriodoPago` — estado de ciclo real + crédito heredado/al cierre

```prisma
model PeriodoPago {
  id                Int         @id @default(autoincrement())
  id_contrato       Int
  contrato          Contrato    @relation(fields: [id_contrato], references: [id])
  periodo           String      @db.VarChar(7)   // "2026-08"
  fecha_vencimiento DateTime    @db.Date
  estado_ciclo      EstadoCiclo @default(ABIERTO)

  // Crédito con el que NACE este período — copiado de credito_al_cierre
  // del período anterior del mismo contrato (0 si no había nada, o si es
  // el primer período). Se aplica automáticamente al Cargo de alquiler
  // en el momento de abrirse (sección 4.1). Nunca se recalcula después.
  credito_heredado Decimal @default(0) @db.Decimal(15, 2)

  // Cuánto sobró (si sobró algo) al CERRAR este período — calculado una
  // única vez en avanzarPeriodo, nunca antes ni después. NULL mientras
  // el período sigue ABIERTO. Si el período cerró con deuda en vez de
  // sobrante, este campo queda en 0 — esa deuda no necesita representarse
  // acá, ya vive en los propios Cargo con pendiente > 0 (sección 2).
  credito_al_cierre Decimal? @db.Decimal(15, 2)

  cargos Cargo[]

  @@unique([id_contrato, periodo])
  @@map("periodos_pago")
}

enum EstadoCiclo {
  FUTURO
  ABIERTO
  CERRADO
}

enum EstadoCobranza {
  PENDIENTE
  PARCIAL
  TOTAL
  VENCIDO
}
```

`estado_cobranza` no es una columna — es el resultado de `calcularEstadoCobranza({ montoTotal, montoPendiente, vencido })` (`lib/estado-cobranza.ts`, ya implementada sin cambios), calculado en el momento de leer un período sumando los `Cargo` **de ese período específico** (no la deuda arrastrada de otros períodos, que se calcula aparte si hace falta mostrarla).

**Invariante:** un contrato tiene como máximo un `PeriodoPago` con `estado_ciclo = ABIERTO` a la vez.

**Invariante de `credito_al_cierre`:** en cualquier momento, a lo sumo un `PeriodoPago` de un contrato dado tiene una `Transaccion` de cobro de ese contrato con saldo sin aplicar (sección 3.5) — el del período `ABIERTO` actual. Cualquier sobrante de un período ya `CERRADO` se consolidó en su `credito_al_cierre` y se aplicó al abrir el siguiente; no queda flotando.

### 3.2 `Cargo` — cada obligación es una fila propia e inmutable, vive indefinidamente

```prisma
model Cargo {
  id          Int         @id @default(autoincrement())
  id_periodo  Int
  periodo     PeriodoPago @relation(fields: [id_periodo], references: [id])
  id_contrato Int         // desnormalizado — evita el JOIN contra PeriodoPago al filtrar por contrato
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

enum TipoCargo {
  ALQUILER
  GASTO
  PUNITORIO
  AJUSTE
}
```

Un `Cargo` nunca se edita ni se "traslada" a otro período. Si queda con deuda cuando su período cierra, sigue ahí — sin cambios — hasta que un pago futuro lo cubra. La prelación de `PagosService.registrar` trae todos los `Cargo` del contrato (de cualquier período, cerrado o abierto) ordenados por `creado_en`, así que el más viejo se cobra primero sin ningún mecanismo de arrastre dedicado.

### 3.3 `AplicacionPago` — una sola FK

```prisma
model AplicacionPago {
  id             Int         @id @default(autoincrement())
  id_transaccion Int
  transaccion    Transaccion @relation(fields: [id_transaccion], references: [id])
  id_cargo       Int
  cargo          Cargo       @relation(fields: [id_cargo], references: [id])
  id_liquidacion Int?
  liquidacion    Liquidacion? @relation(fields: [id_liquidacion], references: [id])
  monto_aplicado Decimal     @db.Decimal(15, 2)

  @@map("aplicaciones_pago")
}
```

### 3.4 `Transaccion` — sin cambios de schema

Sigue siendo específicamente movimientos de caja real, exactamente como está hoy. El trigger de inmutabilidad (`trg_transacciones_immutable`) queda intacto, sin ninguna excepción.

### 3.5 Cálculo de saldos derivados (dentro de un período que sigue abierto)

Mientras un período está `ABIERTO`, cuánto falta de un `Cargo` o cuánto sobra de una `Transaccion` se calcula con la misma operación:

```
pendiente_de_un_cargo = Cargo.monto − SUM(AplicacionPago.monto_aplicado WHERE id_cargo = X)
disponible_de_un_pago = Transaccion.monto − SUM(AplicacionPago.monto_aplicado WHERE id_transaccion = X)
```

En código: `lib/saldos.ts`, función `calcularPendiente(monto, aplicaciones)`. El volumen por contrato/transacción es chico (un puñado de aplicaciones, nunca miles), así que se trae con `include: { aplicaciones: true }` y se calcula en memoria — sin SQL agregado, sin índice especial más allá de las FK ya existentes.

## 4. Flujos de referencia

### 4.1 Ejemplo completo con trazabilidad — deuda vieja + saldo a favor arrastrado

Contrato de María: alquiler $600.000/mes, comisión 10%.

**Agosto:**
```
Cargo #1 ALQUILER $600.000 (creado 01/08)
Pago T1 $400.000 (15/08) → AplicacionPago $400.000 → Cargo #1
Cargo #1 pendiente: $200.000
```

**Se cierra Agosto** (sin haber cobrado los $200.000 — la deuda no se "guarda" en ningún lado especial, simplemente el `Cargo #1` sigue existiendo con pendiente $200.000):
```
Agosto.credito_al_cierre = $0 (no sobró nada)
Agosto.estado_ciclo = CERRADO
```

**Septiembre:**
```
Cargo #2 ALQUILER $600.000 (creado 01/09)
Pago T2 $900.000 (20/09) — la prelación busca TODOS los Cargo pendientes
del contrato, ordenados por antigüedad, sin importar el período:
  $200.000 → Cargo #1 (Agosto, el más viejo)  → comisión $20.000
  $600.000 → Cargo #2 (Septiembre)            → comisión $60.000
  $100.000 → sin aplicar a ningún Cargo (sobra)
```

**Se cierra Septiembre** — acá está el cálculo que importa: NO se compara "total cargos de septiembre" contra "total cobrado durante septiembre" (eso mezclaría mal el pago a la deuda vieja de Agosto). Se calcula, para cada `Transaccion` de cobro de este contrato, cuánto de ella sigue sin aplicar a nada:
```
calcularPendiente(T2.monto=900.000, T2.aplicaciones=[200k, 600k]) = $100.000
Septiembre.credito_al_cierre = $100.000  (la única transacción con sobrante es T2)
Septiembre.estado_ciclo = CERRADO
```

**Octubre:**
```
Octubre.credito_heredado = $100.000 (copiado de Septiembre.credito_al_cierre)
Cargo #3 ALQUILER $600.000 (creado 01/10)

Se aplica automáticamente el sobrante identificado en el cierre (T2, que
tenía $100.000 sin aplicar) contra el Cargo #3:
  AplicacionPago $100.000 (T2 → Cargo #3) → comisión $10.000
Cargo #3 pendiente: $500.000
```

**Trazabilidad completa de T2** (un solo pago de $900.000, reconstruible con un JOIN):
```sql
SELECT c.id AS cargo, c.tipo, pp.periodo, ap.monto_aplicado
FROM aplicaciones_pago ap
JOIN cargos c ON c.id = ap.id_cargo
JOIN periodos_pago pp ON pp.id = c.id_periodo
WHERE ap.id_transaccion = T2.id
```
```
Cargo #1  ALQUILER  Agosto      $200.000
Cargo #2  ALQUILER  Septiembre  $600.000
Cargo #3  ALQUILER  Octubre     $100.000   ← aplicada después, al abrirse octubre
─────────────────────────────────────────
Total: $900.000 = exactamente lo que pagó, sin ambigüedad ni pérdida de información.
```

### 4.2 Mecanismo exacto de cierre y apertura (`ContratosService.avanzarPeriodo`)

**Al cerrar el período `ABIERTO` actual:**
1. Traer todas las `Transaccion` de tipo `INGRESO_COBRO` de este contrato, con sus `aplicaciones`.
2. Para cada una, calcular `calcularPendiente(monto, aplicaciones)`. Sumar las que den positivo → ese total es `credito_al_cierre`. (Por invariante — sección 3.1 — nunca hay sobrante de más de un período a la vez, así que en la práctica esto identifica cero o una transacción con sobrante, la del período que se está cerrando.)
3. Persistir `credito_al_cierre` en el período que se cierra, y `estado_ciclo = CERRADO`. Esta es la única escritura sobre un período después de su creación — nunca se vuelve a tocar.

**Al abrir el período nuevo:**
1. Crear el `PeriodoPago` con `credito_heredado` = el `credito_al_cierre` recién calculado del período anterior (0 si no había).
2. Crear el `Cargo ALQUILER` por `monto_base`.
3. Si `credito_heredado > 0`: tomar la(s) transacción(es) identificadas en el paso de cierre (las que tenían sobrante) y aplicarlas contra este `Cargo` nuevo, generando la comisión correspondiente en ese momento (nunca antes).

### 4.3 Contra-asiento sobre un `Cargo` de un período ya cerrado

Un período `CERRADO` nunca se modifica. Si hay que revertir un pago que se había aplicado a un `Cargo` de un período que ya cerró, el ajuste se refleja como un `Cargo` nuevo de tipo `AJUSTE` en el período **`ABIERTO` actual** del mismo contrato — nunca reabriendo ni tocando el período viejo. Si el `Cargo` a revertir pertenece al período que sigue `ABIERTO`, se aplica directo (nueva `AplicacionPago` negativa contra el mismo `Cargo`, sin necesitar ningún `AJUSTE`).

## 5. Por qué NO un balance materializado (`ContractAccount`) ni una tabla aparte de obligaciones abiertas

(Sin cambios respecto a la versión anterior de este spec — ver razones de escala. El único ajuste: el índice relevante sobre `Cargo` es `id_contrato` solo, no `(id_contrato, monto_pendiente)`, porque no hay campo de pendiente que indexar.)

## 6. Impacto en el código ya construido

Reemplaza el corazón del modelo financiero implementado en `docs/superpowers/plans/2026-08-21-modelo-financiero-conciliacion.md` — no es aditivo:

- **Schema:** `PeriodoPago` (agrega `credito_heredado`/`credito_al_cierre`, sin `estado_cobranza` como columna), `Cargo` (nuevo, sin campo de pendiente), `AplicacionPago` (FK simplificada). `Transaccion` sin cambios.
- **Services:** `ContratosService.activar`/`avanzarPeriodo` (genera `Cargo ALQUILER`, aplica crédito heredado, calcula y persiste `credito_al_cierre` al cerrar), `PagosService.registrar` (prelación sobre todos los `Cargo` del contrato por antigüedad, sin distinguir período), `GastosService` (genera `Cargo GASTO`), `LiquidacionesService` (agrupa por `Cargo.tipo`), `InquilinosService.obtenerSaldo` (sobre `Cargo` calculado), `TransaccionesService` (contra-asiento genera `Cargo AJUSTE` en el período abierto si el original ya cerró).
- **Tests:** toda la suite de `node:test` de estos services queda obsoleta en su forma actual.
- **UI:** `BadgeEstadoPeriodo`, `PeriodoResumenRow`, `ModalPeriodos`, rutas de contratos/inquilinos/propietarios que leían campos eliminados.
- **Seed de datos** (`prisma/seed.ts`) se reescribe contra el modelo nuevo.
- **Motor de tiempo** (spec original, sección 7, nunca implementado) — sigue pendiente; el diseño de `Cargo`/`estado_ciclo` está pensado para que ese motor lo use directamente.

## 7. Fuera de alcance de este spec

- El motor de tiempo en sí.
- Migración de datos ya sembrados con el modelo viejo — la base de desarrollo se trunca y se vuelve a sembrar.
- Cambios a `Gasto` más allá de la relación con `Cargo`.
- Reportes o dashboards de caja.
- Que el saldo a favor cruce entre distintos contratos del mismo inquilino (aceptado como limitación de esta versión — ver sección 2).
