# Motor de punitorios/intereses — Diseño

## 1. Contexto

`Contrato.pct_punitorio_diario` existe en el schema desde el motor de períodos y movimientos (`docs/superpowers/specs/2026-08-23-motor-periodos-movimientos-design.md`), y `Cargo.tipo` incluye `PUNITORIO` desde el mismo spec — pero ambos quedaron explícitamente **fuera de alcance**: nunca se implementó ningún cálculo real. `PagosService.registrar` ya tiene un Paso 1 de prelación ("punitorios pendientes, más antiguos primero") escrito y probado, pero es un no-op en la práctica porque nunca existe ningún `Cargo PUNITORIO` real. `InquilinosService.obtenerSaldo` separa `cargosPunitorio` del resto por la misma razón — la ruta que lo expone (`/api/v1/inquilinos/[id]/saldo`) omite ese campo a propósito hasta que este motor exista.

Este documento diseña el motor que efectivamente genera esos `Cargo PUNITORIO`.

## 2. Decisiones

### 2.1 Disparador: manual, no automático

Se descartó un cron (diario o mensual) y también el cálculo al vuelo sin persistir. La razón, explícita del usuario: cobrar intereses nunca es un hecho puramente mecánico — antes de generar un punitorio real hay una gestión humana (contacto con el inquilino, negociación, a veces se perdonan días). Un cron automático fuerza a "deshacer" cargos generados de más cada vez que la realidad se aparta de la regla escrita, lo cual viola el principio de "nunca actualizar un hecho financiero ya registrado."

En su lugar: un botón **"Calcular intereses"** por contrato. Sin cron, sin tabla de cola/outbox, sin variable de entorno nueva, sin endpoint bajo `/api/v1/cron/*`. Es una acción autenticada de sesión común, sincrónica.

### 2.2 Selección de cargos, no fecha manual

Primera iteración del diseño proponía un campo "calcular desde" editable. Se descartó: el usuario prefiere seleccionar **sobre qué `Cargo` puntuales** calcular intereses en cada corrida (checkbox por cargo en un diálogo), en vez de elegir una fecha de corte. "Perdonar" una deuda es, en este diseño, simplemente no seleccionar ese `Cargo` en la corrida — no hay una fecha de perdón editable.

### 2.3 Fecha de inicio del interés: día 1 del período, sin margen de gracia

Regla final (revirtió una decisión intermedia — ver historial de la conversación de diseño): el interés de un `Cargo` cuenta desde el **día 1 del mes calendario de su `período`** (ej. período "2026-08" → 1/8), no desde `fecha_vencimiento + 1`. No hay margen de gracia.

### 2.4 Tasa e interés simple

- Tasa: `Contrato.pct_punitorio_diario` (ya existe en el schema, hoy decorativo).
- Interés **simple**, no compuesto: un `Cargo PUNITORIO` nunca genera punitorio sobre sí mismo. La tasa diaria aplica solo sobre `Cargo` de tipo `ALQUILER`, `GASTO` o `AJUSTE` (cualquier tipo salvo `PUNITORIO`).
- Base diaria: el **saldo pendiente histórico real** del `Cargo` en cada día del rango — no el pendiente de hoy aplicado a todo el rango. Si hubo un pago parcial a mitad del rango, los días anteriores a ese pago usan una base más alta que los posteriores. Se calcula considerando, para cada día `d`, solo las `AplicacionPago` cuya `Transaccion.fecha_transaccion <= d`.

### 2.5 Granularidad de persistencia: un `Cargo` por corrida, no uno por día

Cuando el disparador iba a ser un cron diario, tenía sentido generar un `Cargo PUNITORIO` por día (cada corrida cubre exactamente un día). Con disparador manual y ocasional, eso generaría decenas de filas por un solo click sobre una deuda vieja. Decisión final: **un único `Cargo PUNITORIO` por corrida**, que internamente sigue calculando día por día (para respetar la base histórica correcta, sección 2.4) pero persiste la suma de todos los días como un solo monto, con dos campos (`fecha_punitorio_desde`/`fecha_punitorio_hasta`) que marcan qué rango cubre.

### 2.6 Encadenamiento entre corridas sucesivas

El `desde` de cada corrida nunca lo tipea el operador — lo calcula el sistema:
- Primera vez que se calcula interés sobre un `Cargo`: `desde` = día 1 del mes de su período.
- Corridas siguientes: `desde` = `(fecha_punitorio_hasta` de la última corrida sobre ese mismo `Cargo`) + 1 día.

`hasta` siempre es "hoy" (`hoyEnArgentina()`, respeta `FECHA_SIMULADA` si está seteada — nunca `new Date()` crudo).

Esto hace que el diseño sea **puramente aditivo y seguro de repetir**: cada corrida completa exactamente el hueco entre la última vez que se calculó y hoy, sin day-overlap posible por construcción (no porque se detecte y se descarte, sino porque el punto de partida siempre es matemáticamente el día siguiente al último cubierto).

### 2.7 Concurrencia e idempotencia

Restricción de base: `@@unique([id_cargo_origen, fecha_punitorio_desde])` en `Cargo`. Como el `desde` de una corrida se deriva determinísticamente del estado existente (sección 2.6), dos ejecuciones concurrentes sobre el mismo `Cargo` (doble click, dos pestañas) leerían el mismo estado "última corrida" y calcularían el mismo `desde` — la segunda inserción choca contra la constraint y falla, en vez de duplicar o solapar rangos.

Para evitar la ventana de carrera entre "leer último `desde`" y "insertar el nuevo `Cargo`", el cálculo sobre cada `Cargo` de origen corre bajo `SELECT ... FOR UPDATE` sobre sus filas de `punitorios` existentes — mismo patrón de bloqueo pesimista ya usado en `CierrePeriodosService.procesarUnaFilaDeCola` (aunque acá no hace falta `SKIP LOCKED`: si dos requests compiten por el mismo `Cargo`, es correcto que una espere a la otra en vez de saltearla, ya que no hay una cola de trabajo de fondo — es una acción de usuario puntual).

### 2.8 Deliberadamente fuera de alcance de esta corrida

- **Transición automática `ACTIVO → MOROSO`**: el usuario confirmó explícitamente que decide esto en otra conversación ("Dejalo como TODO's, vemos cuando alguien se convierte en moroso"). Hoy la única transición a `MOROSO` es manual (forzada a mano en el seed) o inexistente en código real; este motor no la dispara.
- **Tope máximo de punitorio**: sin límite de días o de porcentaje acumulado — corre indefinidamente mientras el `Cargo` de origen tenga saldo pendiente. Si se necesita un tope en el futuro, se agrega como una regla nueva sin romper lo ya generado (los `Cargo PUNITORIO` ya creados son hechos, no se recalculan).
- **Trazabilidad día-por-día persistida**: el usuario confirmó que el rango `desde`/`hasta` en un único `Cargo` alcanza — no hace falta guardar el detalle de cada día individual en ningún lado, ni como filas separadas ni como un campo JSON de auditoría.
- **Cron/outbox de cualquier tipo para este motor**: descartado explícitamente (sección 2.1).

## 3. Modelo de datos

Tres campos nuevos en `Cargo` (ninguna tabla nueva):

```prisma
model Cargo {
  // ...campos existentes sin cambios...

  id_cargo_origen       Int?
  cargo_origen          Cargo?    @relation("PunitorioDeCargo", fields: [id_cargo_origen], references: [id])
  punitorios            Cargo[]   @relation("PunitorioDeCargo")
  fecha_punitorio_desde DateTime? @db.Date
  fecha_punitorio_hasta DateTime? @db.Date

  @@unique([id_cargo_origen, fecha_punitorio_desde])
}
```

- `id_cargo_origen`/`cargo_origen`/`punitorios`: relación self-referencial. Solo se setea en `Cargo` de tipo `PUNITORIO` — apunta al `Cargo` (`ALQUILER`/`GASTO`/`AJUSTE`) sobre el que se calculó ese interés.
- `fecha_punitorio_desde`/`fecha_punitorio_hasta`: rango de días que cubre ese `Cargo PUNITORIO`. `null` en cualquier `Cargo` que no sea `PUNITORIO`.
- El resto de los campos existentes de `Cargo` (`id_periodo`, `id_contrato`, `monto`, `descripcion`) se usan igual que hoy: el `Cargo PUNITORIO` usa el mismo `id_contrato` que su cargo de origen, pero **`id_periodo` es el período `ABIERTO` actual del contrato, no el período del cargo de origen** — corregido durante la validación manual del motor (la primera versión de este spec decía lo contrario). Es el mismo criterio que ya usa el `Cargo AJUSTE` que nace de un contra-asiento sobre un período `CERRADO`: el punitorio es un hecho nuevo que se registra hoy, aunque esté basado en deuda vieja — pertenece a los libros del período vigente, no al período (posiblemente cerrado hace rato) donde nació la deuda original.

## 4. Flujo completo

1. **UI**: `BotonesContrato.tsx` agrega un botón "Calcular intereses" (mismo lugar que "Registrar pago"/"Cargar gasto"), visible en los mismos estados que esos dos (`ACTIVO`/`MOROSO`/`POR_VENCER`/`VENCIDO`).
2. El botón abre un modal nuevo (`ModalCalcularIntereses.tsx`) que lista todos los `Cargo` del contrato con `pendiente > 0` (tipo ≠ `PUNITORIO`) — período, tipo, monto, pendiente — con un checkbox por fila. Reutiliza la misma forma de datos que ya expone `InquilinosService.obtenerSaldo` para `detalle_periodos`, pero acotada a un solo contrato (`id_contrato` en vez de `id_inquilino`).
3. El operador selecciona uno o más `Cargo` y confirma → `POST /api/v1/contratos/[id]/calcular-intereses` con body `{ ids_cargo: number[], id_usuario_creador: number }`.
4. `PunitoriosService.calcularIntereses(id_contrato, ids_cargo, id_usuario_creador)`:
   - Para cada `id_cargo` en `ids_cargo` (validando que pertenezca al contrato y tenga `pendiente > 0`):
     - `SELECT` de sus `punitorios` existentes `FOR UPDATE`.
     - `desde` = `max(fecha_punitorio_hasta) + 1 día` entre sus punitorios existentes, o el día 1 del mes de `cargo.periodo.periodo` si no tiene ninguno.
     - `hasta` = hoy (`hoyEnArgentina()`).
     - Si `desde > hasta` (ya se calculó hasta hoy en una corrida anterior el mismo día), se saltea este cargo sin generar nada.
     - Itera cada día `d` desde `desde` hasta `hasta`: recalcula el pendiente del cargo de origen considerando solo `AplicacionPago` cuya `Transaccion.fecha_transaccion <= d`, multiplica por `pct_punitorio_diario / 100`, acumula.
     - Crea un único `Cargo` nuevo: `tipo: "PUNITORIO"`, `monto` = la suma acumulada, `id_cargo_origen`, `fecha_punitorio_desde: desde`, `fecha_punitorio_hasta: hasta`, `id_contrato` igual al del cargo de origen, `id_periodo` = el período `ABIERTO` actual del contrato (no el del cargo de origen — ver sección 3), `descripcion` legible (ej. "Intereses 01/08/2026 al 25/08/2026 — 25 días").
   - Devuelve `{ generados: number, monto_total: Decimal }`.
5. La UI muestra un toast con el resultado y refresca.

No requiere ninguna transacción envolvente sobre todo el lote de `ids_cargo` — cada `Cargo` de origen se procesa con su propio lock puntual; si uno falla (ej. constraint violation por una corrida concurrente sobre el mismo cargo), no debería frenar el procesamiento de los demás cargos seleccionados en el mismo click.

## 5. Impacto en código

- **Modificar**: `prisma/schema.prisma` (3 campos + `@@unique` en `Cargo`), migración no-interactiva.
- **Crear**: `services/punitorios.service.ts` (`calcularIntereses`).
- **Crear**: `app/api/v1/contratos/[id]/calcular-intereses/route.ts` (`POST`).
- **Crear**: `components/features/contratos/ModalCalcularIntereses.tsx`.
- **Modificar**: `components/features/contratos/BotonesContrato.tsx` (agrega el botón/modal nuevo).
- **Sin cambios**: `PagosService.registrar` (su Paso 1 de prelación sobre punitorios ya existe y ya está probado — simplemente deja de ser un no-op en cuanto existan `Cargo PUNITORIO` reales). `lib/estado-cobranza.ts`, `TablaLibroDiario`/`BadgeTipoTransaccion` (un `Cargo PUNITORIO` ya se ve en el libro mayor del contrato vía `ETIQUETA_TIPO.PUNITORIO`, ya definido).
- **Pendiente, no parte de esta tarea** (anotar en TODO.md al implementar): `/api/v1/inquilinos/[id]/saldo` y `ModalDeudaInquilino.tsx` hoy omiten `punitorios` a propósito — una vez que este motor exista y genere datos reales, esa omisión pasa a ser incorrecta y hay que revertirla.

## 6. Testing

- `services/punitorios.service.ts`: día 1 del período como `desde` en la primera corrida; encadenamiento correcto en una segunda corrida (`desde` = `hasta` anterior + 1); base histórica correcta cuando hay un pago parcial a mitad del rango (dos días con bases distintas, verificar el monto sumado exacto); un `Cargo PUNITORIO` no genera punitorio sobre sí mismo (no aparece en la lista de cargos elegibles); `Cargo` ya completamente pagado no genera nada; selección de múltiples `Cargo` en un solo llamado; `desde > hasta` (ya corrido hoy) no genera nada ni falla; concurrencia — dos llamados simultáneos sobre el mismo `Cargo` (uno debe fallar por la constraint, el otro debe tener éxito, sin duplicar rango).
- Sin tests de integración de la ruta (consistente con la convención ya establecida en el resto del proyecto — documentado en `docs/superpowers/plans/TODO.md` punto 12).

## 7. Fuera de alcance

Ver sección 2.8.
