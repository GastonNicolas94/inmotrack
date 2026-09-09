# InmoTrack — Modelo Financiero de Conciliación (Diseño)
**Fecha:** 2026-08-21
**Estado:** Aprobado (pendiente de implementación)
**Reemplaza:** el módulo financiero descrito en `SDD.md` v1.0 (Transaccion/Liquidacion/Gasto/DepositoGarantia originales, descartados junto con su código el 2026-08-21)

---

## 1. Contexto y motivación

El proyecto tenía un módulo financiero completo (libro diario, liquidaciones, gastos, depósito en garantía, cron de morosidad) que fue descartado deliberadamente junto con su código y sus tablas. El motivo de fondo: el mecanismo de conciliación de pagos pisaba campos denormalizados (`periodos_pago.monto_cobrado`, `gastos.monto_cobrado_inquilino`) directamente desde el service, sin dejar un registro trazable de *a qué se aplicó* cada peso cobrado.

Este documento define el reemplazo: un motor de conciliación centrado en una entidad `AplicacionPago`, que es la fuente de verdad de todo cobro. Los campos que hoy viven en `PeriodoPago` (`monto_cobrado`, `estado`) pasan a ser **proyecciones cacheadas**, reconstruibles sumando `AplicacionPago` — nunca la fuente de verdad.

Se mantienen sin cambios los módulos ya implementados y en producción: `Usuario` (auth/RBAC), `Propietario`, `Inquilino`, `Propiedad`. `Contrato` se mantiene con un campo nuevo (ver sección 3.1).

Queda **fuera de alcance**, por decisión explícita de negocio:
- **Depósito en garantía**: este negocio no cobra depósito al firmar contrato. No hay modelo, no hay `INGRESO_GARANTIA`/`EGRESO_GARANTIA`.

---

## 2. Reglas de negocio acordadas

1. **Los punitorios (interés moratorio) son ganancia 100% de la inmobiliaria.** No se comparten con el propietario, no llevan comisión de administración adicional (nunca fueron "ingreso del propietario"), y no entran en la base de cálculo de ninguna liquidación.
2. **La comisión de administración se reconoce en tiempo real**, no al momento de liquidar: cada vez que se registra una `AplicacionPago` de tipo `CAPITAL`, se dispara automáticamente la `Transaccion` de `INGRESO_COMISION` proporcional (`monto_aplicado × pct_comision / 100`) hacia la caja operativa. Misma lógica de timing que los punitorios — no se difiere el reconocimiento de ganancia al momento de la liquidación.
3. **Propiedades propias** (`Propiedad.es_propia = true`): se resuelven fijando `pct_comision = 100` en el contrato — el mecanismo de comisión en tiempo real ya mueve el 100% a caja operativa sin lógica especial. Para no ensuciar el P&L (mezclar "honorarios de administración" con "renta de un inmueble propio"), el service etiqueta esa transacción como `INGRESO_ALQUILER_PROPIO` en vez de `INGRESO_COMISION` cuando la propiedad del contrato es propia.
4. **Separación estricta de cajas en los egresos**: pagarle a un proveedor por un gasto de una propiedad/contrato administrado sale de CAJA 1 (`EGRESO_TERCEROS`, es plata de terceros). Pagar un gasto propio del negocio (sueldos, alquiler de oficina, marketing) sale de CAJA 2 (`EGRESO_OPERATIVO`, plata de la inmobiliaria).
5. **Las liquidaciones a propietarios son un snapshot congelado**, no un cálculo on-the-fly: se persisten en el momento de aprobación (`Liquidacion` + `LiquidacionItem`) y no cambian después, aunque se corrijan datos con fecha retroactiva — la corrección entra en la liquidación del período siguiente.
6. **Sellado de rendición**: para no liquidar dos veces el mismo dinero, cada `AplicacionPago` de tipo `CAPITAL` y cada `Gasto` con `cargo_a = PROPIETARIO` se marcan con el `id_liquidacion` que los incluyó, en el momento de aprobar esa liquidación.
7. **El libro diario (`Transaccion`) es inmutable.** No admite `UPDATE` ni `DELETE` (a nivel de permisos de base de datos y por convención en el service layer). Los errores se corrigen únicamente con `CONTRA_ASIENTO`: una fila nueva con monto invertido, `id_txn_origen` apuntando a la transacción anulada, y `comentario` obligatorio.
8. **Trazabilidad de auditoría**: toda `Transaccion` generada por un humano lleva `id_usuario_creador`. `NULL` significa inequívocamente "generado por un proceso automático", nunca una fila con intervención humana.
9. **Idempotencia**: se mantiene una tabla de claves de idempotencia para prevenir el doble registro de un mismo pago por reintento de formulario o doble clic.

---

## 3. Modelo de datos

### 3.1 Sin cambios (ya implementado)
`Usuario`, `Propietario`, `Inquilino`, `Propiedad` — se mantienen tal cual están en `prisma/schema.prisma` hoy.

`Contrato` se mantiene igual y agrega un campo:

```prisma
model Contrato {
  // ...campos existentes sin cambios...
  fecha_ultimo_ajuste DateTime? @db.Date   // al firmar, toma fecha_inicio; se pisa cada vez que se aplica un ajuste
}
```

Habilita saber cuándo corresponde el próximo ajuste por inflación: `fecha_ultimo_ajuste + meses_act`. Ver sección 8.

### 3.2 `PeriodoPago` (agrega cache de punitorios)

```prisma
model PeriodoPago {
  id                    Int           @id @default(autoincrement())
  id_contrato           Int
  periodo               String        @db.VarChar(7)
  monto_cargo           Decimal       @db.Decimal(15, 2)
  monto_cobrado          Decimal      @default(0) @db.Decimal(15, 2)   // cache: SUM(AplicacionPago.monto_aplicado WHERE tipo_aplicacion = CAPITAL)
  punitorios_devengados  Decimal      @default(0) @db.Decimal(15, 2)   // cache: deuda de mora acumulada (fórmula: días_mora × tasa)
  punitorios_cobrados    Decimal      @default(0) @db.Decimal(15, 2)   // cache: SUM(AplicacionPago.monto_aplicado WHERE tipo_aplicacion = PUNITORIO)
  estado                EstadoPeriodo @default(CARGO_PENDIENTE)        // cache, derivado de monto_cobrado vs monto_cargo
  fecha_vencimiento     DateTime      @db.Date

  contrato     Contrato         @relation(fields: [id_contrato], references: [id])
  aplicaciones AplicacionPago[]

  @@unique([id_contrato, periodo])
  @@map("periodos_pago")
}
```

Los tres campos cacheados (`monto_cobrado`, `punitorios_devengados`, `punitorios_cobrados`) y `estado` **no son la fuente de verdad** — son proyecciones de lectura rápida. `monto_cobrado`, `punitorios_cobrados` y `estado` se actualizan dentro de la misma transacción de Prisma que crea la `AplicacionPago` correspondiente, así que el riesgo de desincronización es solo el de un bug humano, no un problema estructural — y son reconstruibles sumando `AplicacionPago` si hace falta auditar. `punitorios_devengados` se actualiza por el proceso que se decida en la fase de implementación (cron o cálculo on-demand); es indiferente al modelo.

### 3.3 `Gasto` (propiedad opcional, `cargo_a` ampliado, sellado)

```prisma
model Gasto {
  id                Int         @id @default(autoincrement())
  id_propiedad      Int?                          // NULL solo si cargo_a = INMOBILIARIA
  id_contrato       Int?
  id_liquidacion    Int?                          // sellado: ya se descontó al propietario en esta liquidación
  concepto          String
  categoria_interno String?                       // libre; solo se usa en gastos INMOBILIARIA ("Sueldos", "Alquiler oficina", "Marketing"...)
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
```

### 3.4 `Transaccion` (auditoría, contra-asiento, enum consolidado)

```prisma
model Transaccion {
  id                 Int             @id @default(autoincrement())
  tipo               TipoTransaccion
  caja_destino       CajaDestino
  monto              Decimal         @db.Decimal(15, 2)
  fecha_transaccion  DateTime        @default(now())
  id_contrato        Int?
  contrato           Contrato?       @relation(fields: [id_contrato], references: [id])
  id_usuario_creador Int?                              // NULL = generado por un proceso automático
  usuario_creador    Usuario?        @relation("UsuarioCreador", fields: [id_usuario_creador], references: [id])
  id_txn_origen      Int?                              // solo para CONTRA_ASIENTO
  txn_origen         Transaccion?    @relation("ContraAsiento", fields: [id_txn_origen], references: [id])
  contra_asientos    Transaccion[]   @relation("ContraAsiento")
  comentario         String?                           // obligatorio si tipo = CONTRA_ASIENTO
  aplicaciones       AplicacionPago[]

  @@map("transacciones")
}

enum TipoTransaccion {
  INGRESO_COBRO             // bruto cobrado al inquilino, CAJA 1 (TERCEROS)
  INGRESO_COMISION          // honorarios de administración, tiempo real, CAJA 2 (OPERATIVA)
  INGRESO_PUNITORIO         // interés moratorio cobrado, 100% inmobiliaria, CAJA 2 (OPERATIVA)
  INGRESO_ALQUILER_PROPIO   // cobro de contrato sobre propiedad es_propia = true, CAJA 2 (OPERATIVA)
  EGRESO_LIQUIDACION        // pago neto al propietario, CAJA 1 (TERCEROS)
  EGRESO_TERCEROS           // pago a proveedor de un gasto de propiedad/contrato administrado, CAJA 1 (TERCEROS)
  EGRESO_OPERATIVO          // gasto propio del negocio (cargo_a = INMOBILIARIA), CAJA 2 (OPERATIVA)
  CONTRA_ASIENTO            // anulación de una transacción errónea; requiere comentario + id_txn_origen
}

enum CajaDestino {
  TERCEROS
  OPERATIVA
}
```

### 3.5 `AplicacionPago` (motor de conciliación)

```prisma
model AplicacionPago {
  id              Int            @id @default(autoincrement())
  id_transaccion  Int
  id_periodo_pago Int?
  id_gasto        Int?
  id_liquidacion  Int?           // solo relevante si tipo_aplicacion = CAPITAL; debe ser NULL si tipo_aplicacion = GASTO
  tipo_aplicacion TipoAplicacion
  monto_aplicado  Decimal        @db.Decimal(15, 2)   // negativo en reversiones

  transaccion  Transaccion  @relation(fields: [id_transaccion], references: [id])
  periodo_pago PeriodoPago? @relation(fields: [id_periodo_pago], references: [id])
  gasto        Gasto?       @relation(fields: [id_gasto], references: [id])
  liquidacion  Liquidacion? @relation(fields: [id_liquidacion], references: [id])

  @@map("aplicaciones_pago")
}

enum TipoAplicacion {
  CAPITAL
  PUNITORIO
  GASTO
}
```

### 3.6 `Liquidacion` / `LiquidacionItem` (snapshot congelado)

```prisma
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

enum EstadoLiquidacion {
  PENDIENTE
  APROBADA
  PAGADA
}
```

### 3.7 `IdempotencyKey`

```prisma
model IdempotencyKey {
  key             String   @id @db.VarChar(36)
  created_at      DateTime @default(now())
  response_status Int

  @@map("idempotency_keys")
}
```

---

## 4. Reglas de integridad no expresables en el schema de Prisma

Prisma no soporta `CHECK` constraints condicionales nativamente. Estas reglas deben declararse vía SQL crudo en la migración y/o validarse en el service layer antes de cualquier `create`:

1. **Aplicación exclusiva** (`AplicacionPago`): exactamente uno de `id_periodo_pago` / `id_gasto` debe estar presente — nunca ambos, nunca ninguno. Garantiza que el dinero conciliado no quede huérfano ni se duplique.
2. **Gasto propio bien marcado** (`Gasto`): si `id_propiedad IS NULL` ⟹ `cargo_a` debe ser `INMOBILIARIA`. Evita que un gasto sin propiedad asociada quede cargado a un inquilino o propietario inexistente.
3. **Sellado exclusivo de capital** (`AplicacionPago`): si `tipo_aplicacion = GASTO` ⟹ `id_liquidacion` debe ser siempre `NULL`. Un gasto a cargo del inquilino nunca entra en la liquidación al propietario.
4. **Inmutabilidad del libro diario** (`Transaccion`): sin `UPDATE`/`DELETE`, por convención en el ORM y reforzado a nivel de base de datos con un trigger `BEFORE UPDATE OR DELETE` que lanza excepción siempre. Se prefiere el trigger sobre un `REVOKE` de permisos porque este último no tiene efecto si el rol de conexión es superusuario de PostgreSQL (caso real en desarrollo local) — un trigger se dispara sin importar el rol. `comentario` es obligatorio cuando `tipo = CONTRA_ASIENTO`.

---

## 5. Flujos de referencia

### 5.1 Pago de alquiler con mora parcial

Inquilino paga $105.000 de un período con $100.000 de capital adeudado y $5.000 de punitorios devengados. Contrato con `pct_comision = 10`, propiedad no propia.

1. `Transaccion` `INGRESO_COBRO` de $105.000, CAJA 1 (TERCEROS).
2. `AplicacionPago` #1: `tipo_aplicacion = PUNITORIO`, `id_periodo_pago = X`, `monto_aplicado = 5000`. Dispara `Transaccion` `INGRESO_PUNITORIO` de $5.000, CAJA 2 (OPERATIVA).
3. `AplicacionPago` #2: `tipo_aplicacion = CAPITAL`, `id_periodo_pago = X`, `monto_aplicado = 100000`. Dispara `Transaccion` `INGRESO_COMISION` de $10.000 (10% de 100.000), CAJA 2 (OPERATIVA).
4. `PeriodoPago` actualiza en la misma transacción: `monto_cobrado += 100000`, `punitorios_cobrados += 5000`, `estado = COBRADO_TOTAL` (si cubre `monto_cargo`).

### 5.2 Liquidación al propietario

1. Se recolectan las `AplicacionPago` con `tipo_aplicacion = CAPITAL` e `id_liquidacion = NULL` de los contratos del propietario, y los `Gasto` con `cargo_a = PROPIETARIO`, `id_liquidacion = NULL` de sus propiedades.
2. Se calcula `monto_bruto = SUM(AplicacionPago.monto_aplicado)`, `retenciones = comisión ya cobrada en tiempo real + gastos pendientes`, `monto_neto = monto_bruto - retenciones`.
3. Se persiste `Liquidacion` + `LiquidacionItem` (uno por contrato).
4. Se sellan las filas: cada `AplicacionPago` y `Gasto` incluidos reciben el `id_liquidacion` recién creado.
5. Se genera `Transaccion` `EGRESO_LIQUIDACION` por `monto_neto`, CAJA 1 (TERCEROS).

### 5.3 Corrección de un error (contra-asiento)

El cron generó mal un `INGRESO_PUNITORIO` de $5.000 por un contrato ya saldado. Solo ADMIN puede corregirlo:

1. Nueva `Transaccion`: `tipo = CONTRA_ASIENTO`, `monto = -5000`, `id_txn_origen` = la transacción errónea, `comentario` obligatorio, `id_usuario_creador` = el admin.
2. Si la transacción original tenía una `AplicacionPago` asociada, se crea una nueva `AplicacionPago` con `monto_aplicado` negativo, del mismo `tipo_aplicacion` y apuntando a la misma entidad de deuda, vinculada a esta nueva `Transaccion` de contra-asiento — nunca se edita ni se borra la fila original.

---

## 7. El motor de tiempo (proceso diario)

Un único proceso corre una vez al día (madrugada) y es responsable de todo lo que depende del paso del tiempo, no de una acción humana. No genera filas en `Transaccion` — solo actualiza estado y cachés en `PeriodoPago`/`Contrato`, exactamente igual que cualquier UPDATE que ya hiciera un humano por su cuenta.

**1. Generación de períodos — idempotente por diseño:**
Para cada `Contrato` en estado `ACTIVO`: si hoy es ≥ día 1 del mes y no existe ya un `PeriodoPago` para `(id_contrato, periodo_actual)`, se inserta uno con `monto_cargo = Contrato.monto_base` (el valor vigente al momento de generarlo — ver sección 8 para cómo cambia). La condición "no existe todavía" (en vez de "si es exactamente el día 1") hace que una corrida salteada por una caída del proceso se autocorrija al día siguiente sin duplicar nada — la restricción `@@unique([id_contrato, periodo])` es la última línea de defensa.

**2. Devengamiento de punitorios:**
Para cada `PeriodoPago` con `estado IN (CARGO_PENDIENTE, COBRADO_PARCIAL, VENCIDO_IMPAGO)` y `fecha_vencimiento < hoy`, se sube `punitorios_devengados` según la fórmula de mora del contrato (días de atraso × tasa diaria). `COBRADO_TOTAL` se excluye siempre — no hay mora sobre algo ya saldado.

**3. Transición de período a `VENCIDO_IMPAGO`:**
Para cada `PeriodoPago` con `fecha_vencimiento < hoy` y `estado != COBRADO_TOTAL`, el estado pasa a `VENCIDO_IMPAGO` (si no lo estaba ya).

**4. Transición de contrato a `MOROSO`:**
Inmediatamente después del paso 3, para cada `Contrato` con 2 o más `PeriodoPago` en `VENCIDO_IMPAGO`, el contrato pasa a `MOROSO`. El camino de vuelta (`MOROSO → ACTIVO`) ya está resuelto del lado humano — ocurre dentro de `PagosService.registrar` cuando un pago reduce los períodos vencidos a menos de 2 (flujo 5.1). Este proceso solo cubre el camino de ida.

**5. Transición de contrato a `VENCIDO`:**
Para cada `Contrato` en estado `ACTIVO` con `fecha_fin < hoy`, el contrato pasa a `VENCIDO`.

El mecanismo concreto que dispara este proceso (Vercel Cron, GitHub Actions, un job dentro de la propia app) es una decisión de implementación — el diseño de arriba es agnóstico a eso.

---

## 8. Ajuste por inflación

Argentina: el valor del índice (ICL/IPC) casi nunca se conoce al momento en que corresponde aplicarlo — se decide manualmente cuando el admin lo consulta por su cuenta. **Decisión fuerte: sin integración automática a ninguna API de índices en este alcance.** Las fuentes públicas (BCRA/INDEC) cambian de formato y se caen sin aviso; atar el ciclo de facturación de la inmobiliaria a la disponibilidad de una API externa es un riesgo que no se justifica.

**Flujo:**
1. `Contrato.fecha_ultimo_ajuste` (ver sección 3.1) más `meses_act` da la fecha en que corresponde el próximo ajuste. Cuando esa fecha ya pasó, la UI marca el contrato como "pendiente de ajuste" — es una condición calculada, no un estado nuevo en `EstadoContrato`.
2. El admin entra al contrato, consulta el índice por su cuenta, y tipea el nuevo monto directamente (no el índice ni un porcentaje — el monto final ya calculado).
3. Al confirmar: `Contrato.monto_base` se actualiza in-place, y `Contrato.fecha_ultimo_ajuste` se pisa con la fecha del día.
4. Los `PeriodoPago` ya generados no cambian — su `monto_cargo` quedó fijado en el momento en que se crearon (sección 7, paso 1). El nuevo `monto_base` solo afecta a los períodos que el proceso diario genere de ahí en adelante.

---

## 9. Fuera de alcance de este documento

- Mecanismo técnico concreto que dispara el proceso diario (Vercel Cron vs. GitHub Actions vs. job propio) — decisión de implementación.
- Integración con APIs de índices (BCRA/INDEC) — descartada explícitamente, ver sección 8.
- Endpoints, rutas, UI y servicios concretos — se definen en el plan de implementación posterior.
- Migración de datos existentes (no aplica: las tablas del módulo financiero viejo ya fueron dropeadas).
