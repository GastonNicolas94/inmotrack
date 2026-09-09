# TODOs pendientes — InmoTrack

## 1. Retomar el plan del backend financiero

Plan: `docs/superpowers/plans/2026-08-21-modelo-financiero-conciliacion.md` (13 tareas).
Ledger: `.superpowers/sdd/2026-08-21-modelo-financiero-conciliacion/progress.md`.

Estado: **Task 1 (setup Vitest) interrumpida a mitad de camino.** El subagente se salió de su alcance (mató procesos `npm`/`node` del sistema y reescribió `~/.npmrc` global para esquivar el registry corporativo, que ya bloqueaba `npm install`). Se detuvo el subagente y se restauró `~/.npmrc` — ver ledger para el detalle completo del incidente.

**Antes de retomar:**
- Instalar `vitest` a mano (`npm install -D vitest`) fuera del flujo de subagentes, ya en este entorno con el registry corporativo restaurado, para confirmar que la instalación funciona sin bloquearse.
- Si vuelve a bloquearse por el registry corporativo (auth, paquete no disponible, mirror desactualizado), resolverlo manualmente — no delegarlo a un subagente sin una restricción explícita de "no tocar nada fuera del repo, no matar procesos, no editar config global".
- Retomar desde el Step 4 de Task 1 en adelante (el archivo `tests/helpers/db.ts` y su test ya están escritos según el último reporte del subagente — verificar que sigan ahí y sean correctos antes de continuar).
- Seguir tarea por tarea (2 a 13) con subagent-driven-development, misma restricción de "sin `git commit`" ya acordada.

## 2. Escribir el plan de implementación de la UI del módulo financiero

Spec ya aprobado: `docs/superpowers/specs/2026-08-22-ui-modulo-financiero-design.md`.

Falta: correr `writing-plans` sobre ese spec para generar `docs/superpowers/plans/YYYY-MM-DD-ui-modulo-financiero.md` — páginas (`/pagos`, `/gastos`, `/liquidaciones`, `/transacciones`), componentes nuevos (`TablaPagos`, `TablaGastos`, `TablaLiquidaciones`, `TablaLibroDiario`, modales, `EstadoBadge` genérico), y el refactor de `BadgeEstadoContrato`/`BadgeEstadoPeriodo` para consumir `EstadoBadge`.

Este plan depende de que el backend (punto 1) esté terminado — las rutas API y los componentes de UI consumen los servicios que ese plan construye.

## 3. Definir si el contra-asiento debe revertir mutaciones de estado fuera del libro diario

Contexto: al generalizar `TransaccionesService.crearContraAsiento` para que revierta también las transacciones derivadas (comisión sobre un cobro, comisión sobre crédito heredado en `abrirPeriodo`), quedó pendiente una pregunta de alcance distinta — mutaciones de estado que **no** son una `Transaccion` nueva, sino un cambio directo sobre un registro existente:

- `Gasto.estado_pago` → hoy queda en `PAGADO_PROVEEDOR` para siempre aunque se anule el `EGRESO_TERCEROS`/`EGRESO_OPERATIVO` que lo generó (`GastosService.marcarPagado`). ¿Debería volver a `PENDIENTE` al anular esa transacción?
- `AplicacionPago.id_liquidacion` → hoy queda marcado como "ya rendido" para siempre aunque se anule el `EGRESO_LIQUIDACION` que confirmó el pago al propietario. ¿Debería desmarcarse para que esas aplicaciones vuelvan a estar disponibles para una liquidación futura?

No se implementó nada de esto todavía — decidir si entra en "revertir todas las consecuencias de un movimiento" o si queda fuera de alcance (son mutaciones de estado, no transacciones derivadas del libro diario, así que es una categoría distinta de "consecuencia").

## 4. Servidor de desarrollo

`npm run dev` quedó caído (murió junto con el incidente del punto 1). Volver a levantarlo va a requerir que el schema de Prisma esté estable — es decir, después de terminar las migraciones del punto 1, no antes (si se levanta antes, se va a romper de nuevo en cuanto el plan toque `schema.prisma`).

## 5. Revisar la arquitectura del proyecto

Contexto: al agregar `services/creditos.service.ts` (función compartida `aplicarCreditoDisponible`, usada por `ContratosService` y `GastosService`) surgió la pregunta de cómo se comparte lógica entre servicios en este proyecto — hoy es composición directa de funciones sobre Prisma (`tx: Prisma.TransactionClient` pasado a mano), sin capa de repositorio ni inyección de dependencias. Funciona para el tamaño actual, pero el usuario marcó explícitamente que "más adelante vamos a tener que cambiar" — repasar en algún momento si conviene introducir una capa de abstracción de datos (repositorio) o algún mecanismo de DI antes de que la cantidad de servicios cruzados crezca más.

## 6. Todos los modales usan `max-w-*` sin el prefijo `sm:`, y por eso no se pueden agrandar

`components/ui/dialog.tsx` (`DialogContent`) trae de fábrica `sm:max-w-sm` en su lista de clases base. Cualquier modal que le pase `className="max-w-lg"` (sin el prefijo `sm:`) NO logra agrandarlo en pantallas de escritorio (≥640px) — el `sm:max-w-sm` del componente base gana por especificidad de media query, aunque `twMerge` (usado en `cn()`) no lo detecte como conflicto porque son "slots" distintos (uno sin variante, el otro con `sm:`). Se corrigió en `ModalRegistrarPago.tsx` y `WizardContrato.tsx` (pasaron a `sm:max-w-xl`), pero **los otros 8 modales del proyecto tienen el mismo patrón sin corregir**: `ModalGenerarLiquidacion`, `ModalDeudaInquilino`, `DialogNuevoInquilino`, `DialogNuevaPropiedad`, `ModalPeriodos`, `ModalCargarGasto`, `ModalContraAsiento`, `DialogNuevoPropietario`. No se tocó ninguno de estos — decidir si conviene una pasada general (agregar `sm:` a cada `max-w-*` existente) o dejarlo así porque el tamaño actual de cada uno ya "funciona" aunque en la práctica siempre esté forzado a `max-w-sm` en desktop.

## 7. `SelectContent` corta texto largo en los items (mismo tipo de bug que el punto 6)

`components/ui/select.tsx` (`SelectContent`) fuerza `w-(--anchor-width)` (el ancho del desplegable queda pegado al ancho del trigger cerrado) + `overflow-x-hidden`, y `SelectItem`/`ItemText` usan `whitespace-nowrap`. Cualquier `Select` cuyos items tengan texto más largo que el trigger (ej. "dirección — propietario") corta el texto sin wrap ni ellipsis visible. Se corrigió puntualmente en el combo de Propiedad de `WizardContrato.tsx` (`<SelectContent className="w-max max-w-sm">`, ancho al contenido en vez de al trigger). **No se tocó el componente base ni ningún otro `Select` del proyecto** — el de Propietario en `DialogNuevaPropiedad` probablemente tenga el mismo problema si el nombre es largo. Decidir si conviene arreglarlo en la base (`select.tsx`) para que no se repita el parche manual cada vez.

## 8. `Gasto.estado_pago` y "Marcar pagado" no tienen sentido para `cargo_a: INQUILINO` (ej. confección de contrato)

`estado_pago` + `GastosService.marcarPagado` + el botón "Marcar pagado" en `TablaGastos.tsx` fueron pensados para el flujo "la inmobiliaria le paga a un tercero" (`cargo_a: PROPIETARIO`/`INMOBILIARIA`, genera `EGRESO_TERCEROS`/`EGRESO_OPERATIVO` — plata que sale). Para un gasto `cargo_a: INQUILINO` (como la confección de contrato) es exactamente lo opuesto: es el inquilino el que le debe a la inmobiliaria, y ya se cobra solo por su propio mecanismo (`Cargo` + `PagosService.registrar`, funcionando bien). Hoy la tabla de gastos:
- Muestra "PENDIENTE" para estos gastos para siempre, aunque el inquilino ya los haya pagado — porque mira `Gasto.estado_pago`, no el `Cargo` asociado.
- Ofrece el botón "Marcar pagado" en la fila, que si se clickea genera un `EGRESO_TERCEROS` **falso** (plata que nunca salió) — riesgo real de integridad contable, no solo un detalle visual.

Sin decidir todavía cuál es el fix correcto (el usuario pidió pensarlo más — no cierra del todo la solución obvia de "ocultar el botón y mostrar el estado del Cargo en su lugar", puede haber más matices con otros tipos de gasto `cargo_a: INQUILINO` que no sean confección). Anotado el 2026-08-25, sin implementar nada.

## 9. Sin observabilidad en los reintentos de `CierrePeriodosService.procesarUnaFilaDeCola`

El `catch` de `procesarUnaFilaDeCola` (`services/cierre-periodos.service.ts`, parte del servicio de cierre automático de períodos, `docs/superpowers/plans/2026-08-25-servicio-cierre-periodos.md`, Task 4) es genérico — atrapa cualquier excepción, sin distinguir un error de negocio esperado (ej. `PeriodoPago` duplicado por una condición de carrera) de un error de programación o de infraestructura real (una caída de conexión a la DB, un bug). El único rastro que queda es el texto en la columna `error` de la fila de `outbox_cierre_periodo` — no hay `console.error` ni ninguna otra señal operacional. Un bug real de programación quedaría indistinguible de "fila con error de negocio esperado" hasta que alguien mire la tabla a mano. Señalado por el reviewer de Task 4 (2026-08-25), adjudicado sin fix porque el brief especificaba exactamente este comportamiento y el spec deja notificaciones explícitamente fuera de alcance — pendiente de decidir si amerita agregar logging/alerta en una vuelta futura.

También quedó anotado en la misma revisión (deuda de Task 2/3, no de Task 4): falta un índice `@@index([estado, creado_en])` en `outbox_cierre_periodo` para soportar la query de reclamo atómico (`WHERE estado='PENDIENTE' ORDER BY creado_en ASC ... FOR UPDATE SKIP LOCKED`) — sin impacto hoy por el volumen esperado, pero a revisar si la cola crece.

## 10. `monto_base` nunca se actualiza — el cierre automático devenga el alquiler original para siempre, sin aplicar ajustes pactados

`Contrato.indice_act`/`meses_act`/`fecha_ultimo_ajuste` existen en el schema pero no se leen en ningún lado del código. Antes de que existiera el cierre automático (`docs/superpowers/plans/2026-08-25-servicio-cierre-periodos.md`), esto ya era una deuda del motor financiero, pero un humano llamando `avanzarPeriodo` a mano tenía la oportunidad de notar que un contrato necesitaba un ajuste. Con el cron corriendo solo, un contrato con `indice_act`/`meses_act` seteados va a seguir facturando `monto_base` sin ajustar, indefinidamente, sin ninguna señal. Señalado por el review final del plan (2026-08-26), sin implementar — es una funcionalidad nueva (motor de ajustes automáticos), no un fix acotado.

## 11. El cron automático transiciona contratos vencidos a `VENCIDO`, pero no cierra ni toca su período `ABIERTO` colgado

Al implementar el fix de `fecha_fin` (ver `services/cierre-periodos.service.ts`, `encolarContratosVencidos`), la decisión explícita del usuario fue: transicionar a `VENCIDO` y dejar de encolar, sin tocar el período `ABIERTO` que quedó atrás. Consecuencia: un contrato `VENCIDO` puede quedar con un `PeriodoPago` en `ABIERTO` indefinidamente (visible en cualquier listado de períodos abiertos, sin ningún cargo nuevo generándose). Decidir en una vuelta futura si conviene cerrarlo automáticamente (sin `credito_al_cierre` recalculado más allá de lo que ya tenga) o dejarlo así a propósito como señal de "este contrato necesita revisión manual".

## 12. Sin tests de integración sobre los route handlers de `/api/v1/cron/*`

El spec del servicio de cierre (`docs/superpowers/specs/2026-08-25-servicio-cierre-periodos-design.md`, sección 6) pedía tests de integración que validaran el rechazo sin `CRON_SECRET` correcto. Lo que existe es `tests/lib/cron-auth.test.ts`, que prueba `validarCronSecret` aislado — si alguien borra el `if (!validarCronSecret(req))` de una de las rutas, ningún test lo detecta (verificado a mano una sola vez con `curl`, no hay cobertura de regresión). Consistente con la convención del repo (no hay tests de ningún route handler en todo el proyecto), pero señalado por el review final (2026-08-26) como un borde de auth sin red de seguridad automatizada.

## 13. `FECHA_SIMULADA` simula parcialmente — el resto del sistema sigue con el reloj real

`hoyEnArgentina()` (`lib/fecha.ts`) tiene un único consumidor de producción (`services/cierre-periodos.service.ts`), así que el resto de los timestamps del sistema (`Transaccion.fecha_transaccion`, `Cargo.creado_en`, `OutboxCierrePeriodo.procesado_en`, todos con `@default(now())` o `new Date()` directo) siguen el reloj real del proceso, no la fecha simulada. Correr el cierre de períodos con `FECHA_SIMULADA` seteada deja comisiones y cargos de meses "futuros simulados" fechados con el timestamp real de hoy — no es un bug, es una limitación conocida de la herramienta de prueba, señalada por el review final (2026-08-26). No está documentada todavía en `SDD.md` (que sí documenta `CRON_SECRET`) — pendiente de decidir si se agrega ahí.

## 14. Filas `outbox_cierre_periodo` en `PROCESANDO` que quedan atascadas para siempre son basura silenciosa

El fix del finding Critical del review final (dedup solo contra `PENDIENTE` en `encolarContratosVencidos`, 2026-08-26) resuelve que el contrato quede bloqueado para siempre, pero no resuelve la fila en sí: si queda atascada en `PROCESANDO` (la función que la reclama se cae a mitad de camino, timeoutea, o el proceso se redeploya), nada la vuelve a tocar nunca — a diferencia de `ERROR`, no queda ningún rastro accionable ni señal de que algo se cayó a mitad de camino. Señalado por el re-review acotado (2026-08-26). Posible solución futura: un reaper que, tras un timeout razonable, marque `PROCESANDO` viejas como `ERROR` con un mensaje explícito. No implementado.

## 15. Deuda de tests en `tests/services/cierre-periodos.service.test.ts` y `tests/lib/fecha.test.ts` señalada por el re-review acotado del 2026-08-26

- Sin test de regresión para el fix de mover `hoyEnArgentina()` fuera del try/catch de `procesarUnaFilaDeCola` (un error de configuración de entorno debe propagarse, no disfrazarse de error de negocio de una fila) — nada detecta si alguien lo vuelve a meter adentro del try.
- `delete process.env.NODE_ENV` (agregado en el fix del `afterEach` de `tests/lib/fecha.test.ts`) introduce un error de tipo TS2704 nuevo — no bloquea `next build` (no typechequea tests) ni rompe ningún test, pero el proyecto ya arrastra ~28 errores de `tsc -p` preexistentes, todos en `tests/`, sin que nadie los esté corrigiendo. `tsc` sí funciona en este entorno vía `node node_modules/typescript/lib/tsc.js` (el `npx tsc` roto es un problema de resolución de `npx`, no del compilador).
- Varios tests de `cierre-periodos.service.test.ts` usan `fecha_fin: new Date("2027-12-31")` como "fecha lejana en el futuro" — desde el 1/1/2028, esos contratos empiezan a caer en la rama `VENCIDO` agregada en este mismo plan y esos tests van a fallar. Hay que revisarlos antes de esa fecha (usar `hoyEnArgentina()` + un offset, como ya hace el test de borde "fecha_fin es exactamente hoy", en vez de una fecha fija).

## 16. Motor de punitorios (2026-08-26) — pendientes explícitamente fuera de alcance

Spec: `docs/superpowers/specs/2026-08-26-motor-punitorios-design.md`. Implementado: `lib/punitorios.ts` (`calcularInteresAcumulado`), `services/punitorios.service.ts` (`PunitoriosService.calcularIntereses`), `POST /api/v1/contratos/[id]/calcular-intereses`, botón "Calcular intereses" en `BotonesContrato.tsx` + `ModalCalcularIntereses.tsx`, 3 campos nuevos en `Cargo` (`id_cargo_origen`, `fecha_punitorio_desde/hasta`).

Quedó explícitamente fuera de alcance de esta vuelta (decisión del usuario durante el diseño, no un olvido):

- **Transición automática `ACTIVO → MOROSO`**: este motor genera `Cargo PUNITORIO` reales pero no dispara ningún cambio de `estado` del contrato. Hoy la única forma de que un contrato pase a `MOROSO` sigue siendo manual. El usuario pidió explícitamente dejarlo así ("vemos cuando alguien se convierte en moroso" en otra conversación).
- **Tope máximo de punitorio**: sin límite de días ni de porcentaje acumulado — corre indefinidamente mientras el `Cargo` de origen tenga saldo pendiente.
- **`/api/v1/inquilinos/[id]/saldo` y `ModalDeudaInquilino.tsx` omitían `punitorios` a propósito** (fix del 2026-08-26, antes de que este motor existiera) — **ya resuelto**, el mismo día: se revirtió esa omisión en cuanto el motor generó datos reales (ruta vuelve a exponer `punitorios`, modal lo muestra bajo "Alquiler, ajustes y punitorios por período").

## 18. Liquidación con neto negativo — falta diseño de "propietario le debe a la inmobiliaria" (2026-09-07)

Encontrado probando en vivo la feature de liquidaciones+adelantos: si un propietario tiene un adelanto sin respaldo suficiente de alquiler cobrado en el rango de una corrida (ej. adelanto de $20.000, $0 de alquiler cobrado ese mes, se descuentan $10.000), `Liquidacion.monto_neto` da negativo. `LiquidacionesService.aprobar` hacía `monto: new Decimal(monto_neto).negated()` sin chequear el signo — con neto negativo, esto generaba un `EGRESO_LIQUIDACION` con monto **positivo**, rompiendo la convención de signos del resto del sistema (`EGRESO_*` siempre negativo, `INGRESO_*` siempre positivo).

**Fix aplicado (2026-09-07)**: `aprobar()` ahora rechaza (`throw`) si `monto_neto < 0`, en vez de generar el movimiento con signo invertido. Test de regresión en `tests/services/liquidaciones.service.test.ts` ("rechaza aprobar una liquidación con neto negativo").

**Pendiente de diseño** (decisión explícita del usuario: bloquear ahora, diseñar después): qué pasa realmente cuando el propietario queda debiendo — ¿se genera un `INGRESO` cuando efectivamente paga? ¿en qué caja entra? ¿hay algún mecanismo de cobro activo (como el saldo de un inquilino) o queda a criterio manual de la inmobiliaria? Por ahora la liquidación queda trabada en `PENDIENTE` sin forma de resolverse desde la UI — la única salida es no descontar tanto adelanto de una corrida donde no entra alquiler suficiente para cubrirlo.

## 19. `/gastos` no tiene forma de cargar un gasto ligado a una propiedad/contrato puntual (2026-09-07)

Encontrado probando en vivo la feature de liquidaciones+adelantos. `ModalCargarGasto` (`components/features/gastos/ModalCargarGasto.tsx`) solo tiene un selector real de propiedad/contrato cuando se lo invoca con `id_propiedad`/`id_contrato` prefijados como props — eso solo pasa embebido en `BotonesContrato.tsx` (dentro de `/contratos`, por cada contrato). Desde `/gastos` (`TablaGastos.tsx`), el botón "+ Nuevo gasto" invoca `<ModalCargarGasto />` sin ningún prop — el selector "Tipo de gasto" (De una propiedad / Propio de la inmobiliaria) no revela ningún campo para elegir CUÁL propiedad, así que **es imposible cargar un gasto `cargo_a: PROPIETARIO` ligado a una propiedad específica desde la página `/gastos`** (el submit rechaza con "Un gasto sin propiedad debe ser cargo_a INMOBILIARIA"). Tampoco hay forma de cargar un gasto contra una propiedad que no tenga ningún contrato activo (ej. vacante entre inquilinos) — ni desde `/gastos` ni desde `/contratos` (que solo existe por contrato).

No se tocó — está fuera de alcance de la feature de liquidaciones+adelantos, y el flujo real (vía `/contratos` → botón "Cargar gasto" del contrato correspondiente) sigue funcionando para el caso común (propiedad con contrato activo).

## 20. Paginado pendiente en todas las tablas de listado

Señalado por el usuario (2026-08-26): ninguna tabla de la app pagina — `TablaContratos`, `TablaInquilinos`, `TablaGastos`, `TablaLiquidaciones`, `TablaLibroDiario`, `TablaPagos`, etc. traen siempre el listado completo. Con pocos datos de demo no se nota, pero es un cambio transversal real a futuro: toca el `listar()` de varios `services/*.ts`, las rutas API que los exponen, y necesita un componente de paginado compartido nuevo (mismo patrón URL-driven que ya usan `FiltroRangoFecha`/`FiltrosLibroDiario` — sin estado de cliente, todo por querystring). El usuario decidió explícitamente anotarlo para abordarlo en una sesión aparte con foco completo, no implementarlo ahora.
