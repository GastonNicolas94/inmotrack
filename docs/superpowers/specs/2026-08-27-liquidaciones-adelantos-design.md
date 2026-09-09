# Liquidaciones: link correcto, selección por período, y adelantos a propietarios — Diseño

## 1. Contexto

El módulo de liquidaciones ya existe y funciona (`services/liquidaciones.service.ts`, 3 rutas, UI, tests) desde una fase anterior de esta sesión. Al revisarlo en profundidad para evaluar el impacto del motor de punitorios y de la posibilidad de liquidar por período calendario, surgieron tres problemas/necesidades relacionadas, todas sobre el mismo rincón del modelo (`Liquidacion`/`LiquidacionItem`/`AplicacionPago`/`Gasto`):

1. **Selección incorrecta para "liquidar un período calendario".** Hoy `generarParaPropietario` selecciona "todo lo no sellado todavía" (`id_liquidacion IS NULL`), sin importar cuándo se cobró. No hay forma de decir "liquidame específicamente lo que entró en agosto".
2. **`AplicacionPago`/`Gasto` apuntan al nivel equivocado.** Ambos tienen `id_liquidacion` (apuntan directo a `Liquidacion`, la cabecera por propietario), saltándose el nivel de detalle real de la liquidación.
3. **No existe ningún soporte para adelantos.** Los propietarios piden adelantos de plata a la inmobiliaria antes de la liquidación normal; hoy no hay ninguna forma de registrar esa salida de caja `TERCEROS` ni de descontarla (total, parcial, o nada) en una liquidación futura.

Se formalizan las tres juntas porque comparten el mismo modelo de datos y conviene una sola migración de schema coherente, no tres sueltas.

## 2. Decisiones

### 2.1 Selección por rango de fechas (base caja), auto-encadenado

`generarParaPropietario` pasa a recibir `hasta` (además de `id_propietario`) — `desde` **no lo elige el operador**, lo calcula el service: `fecha_hasta` de la última `Liquidacion` de ese propietario + 1 día, o sin piso si es la primera vez. Mismo patrón ya usado en el motor de intereses (encadenamiento automático, sin huecos ni superposiciones posibles por construcción).

- `AplicacionPago` se filtra por `Transaccion.fecha_transaccion` dentro de `[desde, hasta]` — **base caja**: se liquida lo que efectivamente entró a la cuenta en ese rango, sin importar a qué período de alquiler (posiblemente viejo) correspondía la deuda que ese cobro pagó. Confirmado: un pago de septiembre que cubre deuda de julio se liquida en la corrida de septiembre, no en la de julio — y si julio no tuvo ningún cobro, su corrida simplemente sale en $0, sin nada que liquidar.
- `Gasto` se filtra **igual**, por el mismo rango, sin excepción — para esto se le agrega `creado_en: DateTime @default(now())` (hoy no tiene ningún campo de fecha, a diferencia de `Cargo`/`Transaccion` que sí tienen — era un olvido del schema, no una decisión).
- El chequeo `id_liquidacion_item IS NULL` sigue siendo la barrera real contra doble conteo — impide liquidar dos veces el mismo movimiento, independientemente de si los rangos de fecha de dos corridas se superponen por error del operador.

Se descartó un selector de mes calendario a favor del auto-encadenado: no fuerza a que la inmobiliaria liquide siempre el mismo día del mes.

### 2.2 `LiquidacionItem`: dos "sabores" de grano, según el tipo de movimiento

Se debatió extensamente si `LiquidacionItem` debía agrupar por `Contrato` o por `PeriodoPago`. Resolución final — **conviven los dos, cada uno donde tiene sentido real**:

- **Alquiler** (vía `AplicacionPago`, hay plata real que se movió contra un `Cargo`): `LiquidacionItem` por **`PeriodoPago`**. Si un pago cubre 2 meses atrasados de un mismo contrato en una sola corrida, salen 2 `LiquidacionItem` (uno por mes), no uno solo mezclado — más preciso, y no cuesta nada en el caso normal (inquilino paga en término, 1 período por corrida de todas formas).
- **Gasto** a cargo del propietario: nunca tiene una `AplicacionPago` real detrás (nadie le paga ese `Cargo` — es un descuento directo, no una deuda que alguien salda). No tiene sentido forzarlo a un período. `LiquidacionItem` para gastos usa `id_propiedad` directo, `id_periodo` queda `null`. Cubre both casos: gasto con contrato (tiene un `Cargo`, pero ese `Cargo` es irrelevante para esto — se ignora) y gasto sin contrato (propiedad vacía, nunca tuvo ningún `Cargo`).

`LiquidacionItem.id_propiedad` está **siempre presente** (se deriva de `período → contrato → propiedad` cuando hay período, o se usa directo cuando no) — es el ancla constante sin importar el caso.

Se decidió explícitamente **mantener `LiquidacionItem`** como entidad propia (se evaluó eliminarla y resolver el desglose con una consulta en el momento, pero el usuario prefiere conservarla).

### 2.3 `AplicacionPago`/`Gasto` apuntan a `LiquidacionItem`, no a `Liquidacion`

`id_liquidacion` → `id_liquidacion_item` en ambos modelos, apuntando a `LiquidacionItem` en vez de a `Liquidacion`. `Liquidacion` deja de tener una relación directa a `AplicacionPago`/`Gasto` — el acceso pasa a ser siempre `Liquidacion.items[].aplicaciones` / `.gastos_item`.

**Migración**: la única `Liquidacion`/`LiquidacionItem` que existe hoy es la del seed de demo (un solo registro de prueba). Como el grano de `LiquidacionItem` cambia de raíz (antes por contrato, ahora por período/propiedad), no tiene sentido escribir un backfill que reinterprete ese único dato viejo — la migración trunca `liquidaciones`/`liquidaciones_items` (y los `id_liquidacion`/`id_liquidacion_item` de `AplicacionPago`/`Gasto` quedan en `NULL`, como si nunca se hubiera liquidado nada) y el seed los regenera desde cero con el modelo nuevo.

### 2.4 Adelantos a propietarios

- **Registrar un adelanto**: nueva `Transaccion` tipo `EGRESO_ADELANTO`, `caja_destino: TERCEROS` (es plata de terceros, sale antes de la liquidación normal), `monto` negativo, `id_usuario_creador`.
- **A nivel propietario, no de contrato**: `Transaccion` gana un campo nuevo `id_propietario` (opcional — hoy no existe, solo hay `id_contrato`). Un adelanto no se puede atar a un contrato puntual si el propietario tiene varias propiedades.
- **Pendiente de un adelanto**: nunca se cachea — se deriva de `|monto de la Transaccion EGRESO_ADELANTO| - suma de sus DeduccionAdelanto`, mismo principio que el pendiente de un `Cargo`.
- **Descuento en una liquidación**: entidad nueva `DeduccionAdelanto` (`id_transaccion` → la `Transaccion EGRESO_ADELANTO` original, `id_liquidacion`, `monto_descontado`). Nunca se muta el adelanto original — cada descuento es un hecho nuevo que se suma.
- **Al generar una liquidación**: si el propietario tiene adelantos con saldo pendiente, se muestran en la UI y el operador elige **un monto total a descontar esta corrida** (0 a el total pendiente) — no elige adelanto por adelanto; si hay más de un adelanto pendiente, el monto elegido se aplica en orden de antigüedad, pudiendo generar más de un `DeduccionAdelanto` en una sola corrida.
- `Liquidacion.monto_neto` se reduce por lo efectivamente descontado esta corrida; se agrega `Liquidacion.adelantos_descontados` (cristalizado una sola vez al generar, igual que `credito_al_cierre` de un período).
- Si el operador pide descontar más de lo que hay pendiente entre todos los adelantos del propietario, la operación se rechaza (no se clampea en silencio).

## 3. Modelo de datos

```prisma
model Transaccion {
  id                 Int             @id @default(autoincrement())
  tipo               TipoTransaccion
  caja_destino       CajaDestino
  monto              Decimal         @db.Decimal(15, 2)
  fecha_transaccion  DateTime        @default(now())
  id_contrato        Int?
  contrato           Contrato?       @relation(fields: [id_contrato], references: [id])
  id_propietario     Int?
  propietario        Propietario?    @relation(fields: [id_propietario], references: [id])
  id_usuario_creador Int?
  usuario_creador    Usuario?        @relation("UsuarioCreador", fields: [id_usuario_creador], references: [id])
  id_txn_origen      Int?
  txn_origen         Transaccion?    @relation("ContraAsiento", fields: [id_txn_origen], references: [id])
  contra_asientos    Transaccion[]   @relation("ContraAsiento")
  comentario         String?
  aplicaciones       AplicacionPago[]
  deducciones        DeduccionAdelanto[]   // solo relevante si tipo = EGRESO_ADELANTO

  @@map("transacciones")
}

model Liquidacion {
  id                    Int               @id @default(autoincrement())
  id_propietario        Int
  propietario           Propietario       @relation(fields: [id_propietario], references: [id])
  fecha_corrida         DateTime          @default(now())
  fecha_desde           DateTime          @db.Date
  fecha_hasta           DateTime          @db.Date
  monto_bruto           Decimal           @db.Decimal(15, 2)
  retenciones           Decimal           @db.Decimal(15, 2)
  adelantos_descontados Decimal           @default(0) @db.Decimal(15, 2)
  monto_neto            Decimal           @db.Decimal(15, 2)
  estado                EstadoLiquidacion @default(PENDIENTE)

  items       LiquidacionItem[]
  deducciones DeduccionAdelanto[]

  @@map("liquidaciones")
}

model LiquidacionItem {
  id             Int          @id @default(autoincrement())
  id_liquidacion Int
  liquidacion    Liquidacion  @relation(fields: [id_liquidacion], references: [id], onDelete: Cascade)

  // Alquiler: por período (hay AplicacionPago real detrás). Gasto: id_periodo
  // queda null — no hay Cargo que realmente se cobre (o directamente no hay
  // contrato, propiedad vacía) — se ancla solo a la propiedad.
  id_periodo   Int?
  periodo      PeriodoPago? @relation(fields: [id_periodo], references: [id])
  id_propiedad Int
  propiedad    Propiedad    @relation(fields: [id_propiedad], references: [id])

  monto_bruto Decimal @db.Decimal(15, 2)
  comision    Decimal @db.Decimal(15, 2)
  gastos      Decimal @db.Decimal(15, 2)
  monto_neto  Decimal @db.Decimal(15, 2)

  aplicaciones AplicacionPago[]
  gastos_item  Gasto[]

  @@map("liquidaciones_items")
}

model AplicacionPago {
  id                  Int              @id @default(autoincrement())
  id_transaccion      Int
  transaccion         Transaccion      @relation(fields: [id_transaccion], references: [id])
  id_cargo            Int
  cargo               Cargo            @relation(fields: [id_cargo], references: [id])
  id_liquidacion_item Int?
  liquidacion_item    LiquidacionItem? @relation(fields: [id_liquidacion_item], references: [id])
  monto_aplicado      Decimal          @db.Decimal(15, 2)

  @@map("aplicaciones_pago")
}

model Gasto {
  id                  Int         @id @default(autoincrement())
  id_propiedad        Int?
  id_contrato         Int?
  id_liquidacion_item Int?
  concepto            String
  categoria_interno   String?
  monto               Decimal     @db.Decimal(15, 2)
  tipo                TipoGasto   @default(ARREGLO)
  cargo_a             CargoA      @default(PROPIETARIO)
  estado_pago         EstadoGasto @default(PENDIENTE)
  creado_en           DateTime    @default(now())

  propiedad        Propiedad?       @relation(fields: [id_propiedad], references: [id])
  contrato         Contrato?        @relation(fields: [id_contrato], references: [id])
  liquidacion_item LiquidacionItem? @relation(fields: [id_liquidacion_item], references: [id])
  cargos           Cargo[]

  @@map("gastos")
}

model DeduccionAdelanto {
  id               Int         @id @default(autoincrement())
  id_transaccion   Int
  transaccion      Transaccion @relation(fields: [id_transaccion], references: [id])
  id_liquidacion   Int
  liquidacion      Liquidacion @relation(fields: [id_liquidacion], references: [id])
  monto_descontado Decimal     @db.Decimal(15, 2)
  creado_en        DateTime    @default(now())

  @@map("deducciones_adelanto")
}

enum TipoTransaccion {
  INGRESO_COBRO
  INGRESO_COMISION
  INGRESO_PUNITORIO
  INGRESO_ALQUILER_PROPIO
  INGRESO_CONFECCION_CONTRATO
  EGRESO_LIQUIDACION
  EGRESO_TERCEROS
  EGRESO_OPERATIVO
  EGRESO_ADELANTO
  CONTRA_ASIENTO
}
```

**Migración**: además del alta de columnas/tablas de arriba, incluye truncar `liquidaciones`/`liquidaciones_items` (ver sección 2.3 — dato de demo único, sin backfill posible dado el cambio de grano) y resembrar después.

## 4. Flujo completo

### 4.1 Generar liquidación

1. UI: selector de propietario. `desde` se calcula solo (encadenado a la última liquidación de ese propietario); el operador solo elige `hasta` (default hoy). Si el propietario tiene adelantos pendientes, se muestra el total pendiente y un input para elegir cuánto descontar esta corrida (default 0).
2. `POST /api/v1/liquidaciones { id_propietario, hasta, descontar_adelantos }`.
3. `LiquidacionesService.generarParaPropietario(id_propietario, hasta, descontarAdelantos)`:
   - Calcula `desde` internamente.
   - Lock pesimista igual que hoy, extendido a las `Transaccion EGRESO_ADELANTO` del propietario si `descontar_adelantos > 0`.
   - Selecciona `AplicacionPago` sin liquidar con `cargo.tipo = ALQUILER` y `transaccion.fecha_transaccion` entre `desde` y `hasta`. Agrupa por `id_periodo` (vía `cargo.id_periodo`) → un `LiquidacionItem` por período tocado, `id_propiedad` derivado de `periodo.contrato.propiedad`.
   - Selecciona `Gasto` a cargo del propietario sin liquidar y con `creado_en` entre `desde` y `hasta`. Agrupa por `id_propiedad` (directo si no hay contrato, o vía `contrato.propiedad` si lo hay) → un `LiquidacionItem` con `id_periodo: null`. **Nunca se funde** con un `LiquidacionItem` de alquiler de la misma propiedad/corrida (esos tienen `id_periodo` seteado) — son dos filas separadas aunque compartan `id_propiedad`, sin ambigüedad: el criterio de identidad de un `LiquidacionItem` es `(id_liquidacion, id_periodo)` para alquiler y `(id_liquidacion, id_propiedad)` con `id_periodo NULL` para gastos, nunca se pisan.
   - Si `descontar_adelantos > 0`: valida que no supere el total pendiente entre todos los adelantos del propietario (si supera, rechaza). Aplica prelación por antigüedad sobre los adelantos pendientes, generando uno o más `DeduccionAdelanto`.
   - Crea `Liquidacion` (con `fecha_desde`/`fecha_hasta`/`adelantos_descontados`), crea los `LiquidacionItem` correspondientes, y sella cada `AplicacionPago`/`Gasto` con el `id` del `LiquidacionItem` que le corresponde.
4. `monto_neto = monto_bruto - retenciones - adelantos_descontados`.

### 4.2 Registrar un adelanto

1. Botón "Adelanto" en la fila del propietario en `/propietarios` (mismo lugar y patrón visual que "Ver deuda" en `/inquilinos`) → modal con input de monto.
2. `POST /api/v1/propietarios/[id]/adelantos { monto, id_usuario_creador }` → crea la `Transaccion EGRESO_ADELANTO`.

## 5. Impacto en código

- **Modificar**: `prisma/schema.prisma` (campos nuevos, `LiquidacionItem` con grano nuevo, migración que trunca `liquidaciones`/`liquidaciones_items`).
- **Modificar**: `services/liquidaciones.service.ts` (`generarParaPropietario` con `hasta`/`descontar_adelantos`; agrupación por período para alquiler, por propiedad para gastos; sellado apunta a `LiquidacionItem`).
- **Modificar**: `lib/estado-cobranza.ts` (agregar `estadoLiquidacionCargo(cargo)` — `SIN_COBRAR`/`COBRADO_SIN_LIQUIDAR`/`PARCIAL`/`LIQUIDADO`, derivado de `Cargo → AplicacionPago → id_liquidacion_item`, sin cachear).
- **Crear**: `services/adelantos.service.ts` (`registrar`, `obtenerPendiente`).
- **Crear**: `app/api/v1/propietarios/[id]/adelantos/route.ts`.
- **Modificar**: `app/api/v1/liquidaciones/route.ts` (nuevos parámetros).
- **Modificar**: `components/features/liquidaciones/ModalGenerarLiquidacion.tsx` (input de fecha "hasta", default hoy, + input de descuento de adelantos si hay pendientes).
- **Crear**: `components/features/propietarios/ModalRegistrarAdelanto.tsx` (botón + modal, mismo patrón que `ModalDeudaInquilino.tsx`).
- **Sin cambios**: `PagosService.registrar`, `CierrePeriodosService`, `PunitoriosService`, `GastosService.crear` — ninguno toca `AplicacionPago.id_liquidacion(_item)` ni `Gasto.id_liquidacion(_item)` directamente, solo lo lee/escribe `LiquidacionesService`.

## 6. Testing

- `generarParaPropietario`: pago dentro del rango entra; pago fuera del rango (aunque no esté sellado) no entra; pago ya sellado en una corrida anterior no vuelve a entrar aunque su fecha caiga en el rango nuevo; mismos tres casos para `Gasto` usando `creado_en`.
- Un pago que cubre 2 meses atrasados de un mismo contrato en una sola corrida genera 2 `LiquidacionItem` (uno por período), no uno solo.
- Un gasto con contrato y un gasto sin contrato (propiedad vacía) generan `LiquidacionItem` con `id_periodo: null`, ancladas a la propiedad correcta.
- Adelantos: registrar; descuento parcial; descuento total; descuento cero (default); pedir descontar más de lo pendiente rechaza; prelación por antigüedad entre dos adelantos distintos cuando el monto elegido cubre parte de ambos.
- `estadoLiquidacionCargo`: `SIN_COBRAR` cuando el `Cargo` no tiene ninguna `AplicacionPago`; `COBRADO_SIN_LIQUIDAR` cuando ninguna de sus aplicaciones tiene `id_liquidacion_item`; `LIQUIDADO` cuando todas lo tienen; `PARCIAL` cuando hay una mezcla.

## 7. Fuera de alcance

- Reversar/anular una liquidación ya aprobada — el mecanismo genérico de contra-asiento (`TransaccionesService.crearContraAsiento`) ya existe, pero su interacción específica con `Liquidacion`/`DeduccionAdelanto` no se diseña en esta vuelta.
- Interés o cargo alguno sobre un adelanto no devuelto — es una decisión puramente manual de la inmobiliaria, sin ninguna automatización.
- Notificar al propietario sobre liquidaciones o adelantos.
- UI de "revertir un adelanto registrado por error" — usar el contra-asiento genérico existente, sin diseño especial.
- Fecha "desde" editable en el registro de un adelanto (se registra siempre con `fecha_transaccion` real, "ahora").
