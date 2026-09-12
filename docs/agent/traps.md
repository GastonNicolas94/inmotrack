---
type: Traps
version: 14b0d63
validated: 2026-09-12
update_when: cuando se descubre un gotcha no obvio, agregarlo acá en el mismo cambio
scope:
  - services
  - lib
  - prisma
  - tests
  - proxy.ts
---
# Traps — InmoTrack

Cosas no obvias a partir de una lectura rápida, más desvíos deliberados de lo que uno esperaría. Crece incrementalmente — cada vez que algo sorprende durante una sesión de trabajo, entra acá en el mismo cambio.

---

## Next.js solo publica variables del navegador referenciadas estáticamente

El cliente browser de Supabase debe leer `process.env.NEXT_PUBLIC_SUPABASE_URL` y
`process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` de forma explícita en el módulo cliente.
Delegar la lectura completa a una función con `process.env` como argumento por defecto funciona
en Node.js, pero impide que Next.js detecte e incruste esas variables en el bundle del navegador.

---

## El build productivo debe generar Prisma Client explícitamente

Vercel puede instalar las dependencias sin ejecutar los lifecycle scripts transitivos de
Prisma. En ese caso Next.js compila el código, pero el type-check pierde los tipos generados y
reporta parámetros `any` en consumidores de resultados Prisma. El script `build` debe mantener
el orden `prisma generate && next build`; no reemplazarlo por `next build` solo.

---

## Supabase local requiere Docker y usa el puerto 54322

`npm run supabase:start`, `npm run db:reset:local` y el seed DB-backed requieren
Docker Desktop (o un daemon compatible). La base local esperada es únicamente
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`; no sustituirla por una
base remota.

Los tests destructivos requieren explícitamente
`INMOTRACK_ALLOW_DESTRUCTIVE_TESTS=1` antes de parsear la URL. Después validan la
URL canónica exacta `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
(también aceptan el spelling de host `localhost`), el puerto `54322`, la base
`/postgres` y rechazan parámetros de URL. Si falta la marca, la URL o Docker no
está iniciado, deben fallar cerrados o quedar bloqueados; nunca relajar el guard
para que pasen.

---

## Los CHECK y triggers manuales no sobreviven un Prisma diff

`prisma/schema.prisma` y `prisma migrate diff` no representan ni preservan los
`CHECK` constraints ni los triggers manuales de PostgreSQL. Al consolidar un
baseline, auditar las migraciones SQL históricas y volver a agregar solamente el
DDL manual que siga siendo válido para el esquema actual; después verificarlo con
tests de integración contra la base. No asumir que el SQL generado por Prisma
incluye esas reglas.

---

## `transacciones` es inmutable — no hay `UPDATE`/`DELETE`, punto

Trigger de Postgres a nivel de tabla: cualquier intento de `UPDATE` o `DELETE` sobre `transacciones` tira `"La tabla transacciones es inmutable: no se permite UPDATE ni DELETE. Use un CONTRA_ASIENTO."`. Esto incluye intentos "inocentes" como parchear `fecha_transaccion` de una fila para armar un escenario de test — no se puede, ni siquiera desde un script directo contra la DB. La única forma de corregir un movimiento ya registrado es `TransaccionesService.crearContraAsiento` (una fila espejo nueva). Si necesitás una `Transaccion` con una fecha específica para un test, construila con `prisma.transaccion.create({ data: { ..., fecha_transaccion: X } })` desde el vamos — nunca crear-y-después-actualizar.

`liquidaciones`/`liquidaciones_items` (y el resto de las tablas) **no** tienen este trigger — se pueden borrar filas ahí directamente si nunca llegaron a generar una `Transaccion` real (ej. limpiar una liquidación de prueba en estado PENDIENTE que nunca se aprobó).

---

## `PagosService.registrar` nunca acepta `fecha_transaccion` — siempre `now()`

La `Transaccion` de tipo `INGRESO_COBRO` que crea usa el `@default(now())` del schema — no hay ningún parámetro para backdatear un pago. Esto es intencional (un cobro pasa "ahora", no en el pasado), pero es una trampa clásica al escribir tests que necesitan controlar en qué rango de fechas cae un pago: llamar `PagosService.registrar(...)` y después intentar ajustar la fecha no funciona (ver trap de arriba, la tabla es inmutable). Para un escenario de test con fecha controlada, construir la `Transaccion` + `AplicacionPago` a mano contra el `Cargo` correspondiente, en vez de pasar por el service.

Mismo patrón en `AdelantosService.registrar` y `GastosService.crear` (`Gasto.creado_en` también usa `now()` por default).

---

## `FECHA_SIMULADA` solo afecta `hoyEnArgentina()` — nunca las columnas `DateTime`

`FECHA_SIMULADA` (env var, `lib/fecha.ts`) cambia qué devuelve `hoyEnArgentina()` — usado para decidir vencimientos de período, cierre de contratos, punto de partida del motor de punitorios. **No tiene ningún efecto** sobre `Transaccion.fecha_transaccion` ni `Gasto.creado_en`, que siempre usan el reloj real de Postgres (`@default(now())`). Un test que setea `FECHA_SIMULADA` y después espera que un pago recién registrado "caiga" en esa fecha simulada está equivocado — el pago cae en la fecha real del sistema. Esto costó reescribir 6 tests de `tests/services/liquidaciones.service.test.ts` que hardcodeaban rangos como `hasta: new Date("2026-08-31")` asumiendo que "ahora" seguiría siendo agosto 2026 — dejaron de pasar apenas la fecha real avanzó a septiembre. La fix: nunca fechas de calendario absolutas en un test que compara contra algo creado con `now()` — siempre relativas (`new Date()` +/- offset en días), calculadas en el momento en que corre el test.

Bloqueado en producción a propósito: si `NODE_ENV === "production"` y `FECHA_SIMULADA` está seteada, `hoyEnArgentina()` tira en vez de aceptarla en silencio.

---

## Cualquier test bajo `tests/services/`/`tests/db/` trunca TODA la base real

`tests/helpers/db.ts` → `cleanDatabase()` corre `TRUNCATE TABLE ... RESTART IDENTITY CASCADE` sobre todas las tablas de negocio, y se llama en el `beforeEach` de prácticamente todos los `describe`. No hay una base de datos de test separada — es la misma que usa `npm run dev`. Correr un solo archivo de test (no hace falta correr la suite completa) ya destruye cualquier dato armado a mano para explorar la app manualmente. Preguntar antes de correr tests si hay datos manuales en juego; reconstruir con `npm run seed` después si hace falta.

---

## `npx tsc --noEmit` da falsos negativos masivos en este repo

Invocado suelto (sin la resolución de paths/config que usa `next build` internamente), reporta cientos de errores de módulos no encontrados (`react`, namespace `React`) que no son reales — es un problema de cómo `npx` resuelve el compilador contra este `tsconfig.json`, no del código. El type-check real y confiable del proyecto es el que corre dentro de `npx next build` (paso "Running TypeScript"). No usar `tsc --noEmit` como señal de verificación de tipos acá.

---

## `node_modules` puede perder cientos de paquetes sin causa aparente

En un momento de esta sesión, `node_modules` quedó con 631 paquetes de menos que lo que pedía `package-lock.json` (rompiendo `next build` con `Cannot find module '@swc/helpers/...'`), sin que ninguna acción explícita (`npm install`, `rm -rf`) lo causara — la correlación temporal apuntaba a un subagente corriendo comandos dentro de una tarea, pero nunca se confirmó la causa raíz. Si `next build` falla con un módulo faltante que no tiene nada que ver con el cambio de código que se acaba de hacer, sospechar de `node_modules` antes que del código: `npm install` (reconcilia contra el lockfile) resuelve, seguido de `npx prisma generate` (el cliente de Prisma se regenera con el install pero conviene confirmarlo).

---

## `EstadoLiquidacionCargo` / neto negativo de una liquidación — sin diseño de "el propietario debe"

`LiquidacionesService.aprobar` calculaba `EGRESO_LIQUIDACION.monto = monto_neto.negated()` sin chequear el signo. Si `monto_neto` es negativo (un adelanto descontado sin alquiler suficiente cobrado ese rango para cubrirlo), el negado da positivo — un `EGRESO_LIQUIDACION` con signo invertido respecto a la convención del resto del sistema (`EGRESO_*` siempre negativo, `INGRESO_*` siempre positivo). Se corrigió bloqueando la aprobación (`throw`) si `monto_neto < 0`, pero **no existe ningún mecanismo para cobrarle esa diferencia al propietario** — la liquidación queda trabada en `PENDIENTE` sin forma de resolverse desde la UI. Ver `docs/superpowers/plans/TODO.md` punto 18.

---

## `LiquidacionItem` tiene dos "sabores" de grano, nunca se funden

Alquiler → `id_periodo` seteado (hay una `AplicacionPago` real detrás, un pago que cubrió ese período). Gasto a cargo del propietario → `id_periodo: null`, ancla en `id_propiedad` directo (nunca hay un pago real detrás de ese `Cargo`, es un descuento directo). Un `LiquidacionItem` de gasto y uno de alquiler de la MISMA propiedad en la MISMA corrida son dos filas separadas, no se agregan en una sola. Cualquier código que lea `liquidacion.items` esperando "un item por propiedad" está mal — puede haber dos por la misma propiedad, distinguibles solo por `id_periodo` nulo o no.

---

## Selección de liquidación es base caja + auto-encadenada — `desde` nunca lo elige el operador

`LiquidacionesService.generarParaPropietario(id_propietario, hasta, descontarAdelantos)` calcula `desde` internamente = `fecha_hasta` de la última liquidación de ese propietario + 1 día (o un piso muy lejano en el pasado si es la primera vez). El filtro es por `Transaccion.fecha_transaccion` (cuándo entró la plata físicamente), no por a qué período de alquiler correspondía la deuda — un pago de septiembre que cubre deuda de julio se liquida en la corrida de septiembre, no en la de julio. No hay forma de "reabrir" una liquidación de un mes específico después de que el siguiente `desde` ya avanzó más allá.

---

## `Cargo PUNITORIO` va al período `ABIERTO` actual del contrato, no al período del cargo origen

`PunitoriosService.calcularIntereses` busca el período `ABIERTO` fresco del contrato (`periodoAbierto = tx.periodoPago.findFirst({ where: { id_contrato, estado_ciclo: "ABIERTO" } })`) para asignarle el `id_periodo` al `Cargo PUNITORIO` que genera — nunca usa `cargo.id_periodo` (el período, posiblemente ya `CERRADO`, del cargo sobre el que se calculó el interés). Mismo patrón que un `Cargo AJUSTE` generado por contra-asiento. Si se agrega un nuevo tipo de `Cargo` derivado de otro, replicar este patrón — asignarlo al período del cargo origen fue un bug real ya encontrado y corregido una vez.

---

## Plata de punitorio es 100% de la inmobiliaria — nunca se liquida al propietario

Cuando `PagosService.registrar` aplica un cobro contra un `Cargo PUNITORIO`, genera además una `Transaccion INGRESO_PUNITORIO` (`caja_destino: OPERATIVA`) — decisión de negocio explícita, confirmada con el usuario. `LiquidacionesService` filtra por `cargo.tipo === "ALQUILER"` para la selección de alquiler; los punitorios cobrados nunca entran a ninguna liquidación. Si algún reporte/resumen suma "todo lo cobrado de un contrato" sin excluir `PUNITORIO`, va a sobrestimar lo que le corresponde al propietario.

---

## `<Toaster />` va UNA sola vez, en el layout raíz

Hasta el commit `37d97fb`, `<Toaster />` (sonner) estaba montado a mano en 4 páginas sueltas (`inquilinos`, `contratos`, `propiedades`, `propietarios`) y faltaba en las otras 4 (`liquidaciones`, `gastos`, `pagos`, `transacciones`) — el layout raíz (`app/layout.tsx`) no tenía ninguno. Resultado: `toast.error(...)` se ejecutaba sin errores (la lógica de manejo de errores estaba bien) pero no había dónde renderizarlo en la mitad de las páginas — un usuario real veía el botón "no hacer nada" sin ningún feedback. Ya está centralizado en `app/layout.tsx`; si una página nueva vuelve a montar su propio `<Toaster />`, es redundante (React monta dos, no rompe nada visible pero es señal de que no se leyó este archivo).

---

## `ModalCargarGasto` solo tiene selector de propiedad/contrato si se lo invoca con esos props

El componente (`components/features/gastos/ModalCargarGasto.tsx`) expone un selector real de propiedad/contrato únicamente cuando se lo monta con `id_propiedad`/`id_contrato` prefijados (así lo usa `BotonesContrato.tsx`, un botón por cada contrato en `/contratos`). Invocado sin esos props — como hace el botón "+ Nuevo gasto" de `/gastos` (`TablaGastos.tsx`) — el selector "Tipo de gasto" (De una propiedad / Propio de la inmobiliaria) no revela ningún campo para elegir CUÁL propiedad; el submit rechaza con `"Un gasto sin propiedad debe ser cargo_a INMOBILIARIA"` (regla real de `schemas/gasto.schema.ts`). No hay forma de cargar un gasto contra una propiedad sin contrato activo (vacante) desde ningún lado de la UI hoy. Ver TODO.md punto 19.

---

## `SOLO_ADMIN` por handler es method-aware — no alcanza con matchear el path

`SOLO_ADMIN` es un array de `{ pattern: RegExp; methods?: string[] }`. Si `methods` está ausente, aplica a cualquier método (así son las entradas viejas, `confirmar-pago` y `contra-asiento`, que son rutas POST-únicas). La entrada de adelantos sí especifica `methods: ["POST"]` porque esa ruta tiene GET (abierto) y POST (ADMIN-only) en el mismo path. Al agregar una entrada nueva a `SOLO_ADMIN` para un path con más de un método, hay que decidir explícitamente si el gate aplica a todos o solo a alguno — el default (`methods` ausente) es "todos".

---

## Contratos pasan a `VENCIDO` automáticamente en el cierre mensual — sin transición a `MOROSO` automática en ningún lado

`CierrePeriodosService.encolarContratosVencidos()` transiciona un contrato a `VENCIDO` (no lo encola, no le genera más cargos) si `fecha_fin` ya pasó al momento del cierre — deliberado, evita devengar alquiler para siempre en un contrato terminado. En cambio, la transición a `MOROSO` **no existe en ningún lugar automático** del sistema — es una decisión de negocio explícita del usuario, dejada fuera de alcance ("vemos cuando alguien se convierte en moroso" — ver TODO.md). Un contrato con cuotas impagas sigue mostrando `ACTIVO` indefinidamente salvo que alguien lo cambie a mano vía `PATCH /contratos/{id}/estado`.

---

## Filas de `outbox_cierre_periodo` pueden quedar en `PROCESANDO` para siempre

Si el proceso que reclamó una fila (`UPDATE ... SET estado='PROCESANDO' ... RETURNING`) se cae a mitad de camino (timeout, redeploy), no hay ningún reaper que la vuelva a `PENDIENTE`. `encolarContratosVencidos()` deduplica solo contra `PENDIENTE` a propósito — encolar una fila nueva para el mismo contrato es inocuo (el procesamiento relee el período `ABIERTO` fresco antes de actuar, así que la fila "de más" hace no-op) pero significa que una fila atascada en `PROCESANDO` queda ahí para siempre, sin que nadie la note salvo revisando la tabla a mano.

---

## `hoyEnArgentina()` se calcula ANTES del `try/catch` de negocio, a propósito

En `CierrePeriodosService.procesarUnaFilaDeCola()`, si `FECHA_SIMULADA` está mal configurada (formato inválido, o seteada en producción), `hoyEnArgentina()` tira — y ese error debe propagarse como 500 (error de configuración de entorno), nunca disfrazarse de "error de negocio de esta fila puntual" ni consumir uno de los 3 reintentos que tiene una fila real. Por eso el cálculo está fuera del `try` que envuelve el resto del procesamiento. Si se refactoriza esta función, mantener esa fecha fuera del try/catch.

---

## Los cron de cierre se auto-encadenan con `after()` — un error de red se traga en silencio

`GET /cron/activar-cierre-periodos` dispara `POST /cron/procesar-cola-cierre` sin esperarlo (`after()`), y esa segunda ruta se re-dispara a sí misma mientras `huboTrabajo` sea `true`. El `fetch` de cada eslabón tiene un `.catch(() => {})` deliberado (fire-and-forget real) — si la red falla en el medio de la cadena, la cadena simplemente se corta ahí, sin error visible en ningún lado. La próxima corrida mensual del cron principal vuelve a encontrar lo que quedó sin procesar, así que no hay pérdida de datos, pero sí puede haber un cierre de períodos que tarda mucho más de lo esperado en completarse sin que nada lo señale.

---

## `AplicacionPago`/`Gasto` apuntan a `LiquidacionItem`, no a `Liquidacion` — migración truncó el dato viejo

Antes de la migración `20260906221549_liquidaciones_adelantos`, ambos apuntaban directo a `Liquidacion` (saltándose el nivel de detalle real). El grano de `LiquidacionItem` cambió de raíz (antes por contrato, ahora por período/propiedad) en esa misma migración — el único dato viejo que existía (una liquidación de demo) no se pudo backfillear de forma coherente, así que la migración **truncó** `liquidaciones`/`liquidaciones_items` en vez de migrar los datos. Aceptable porque era data de demo pre-lanzamiento — no repetir este approach si alguna vez hay datos reales de producción en juego.

---

## `@db.Date` se lee SIEMPRE con getters UTC, nunca locales

`fecha_inicio`, `fecha_fin`, `fecha_vencimiento`, `Liquidacion.fecha_desde/hasta` son `@db.Date` — se guardan como medianoche UTC sin hora. El proceso corre en `America/Cordoba` (UTC-3); leerlos con `.getMonth()`/`toLocaleDateString()` corre el día uno para atrás siempre (`new Date("2026-09-01").toLocaleDateString("es-AR")` → `"31/8/2026"`). `lib/fecha.ts` (`partesFechaUTC`, `formatFechaLocal`) es el único lugar que debería leer estos campos — cualquier código nuevo que necesite mostrar o comparar una de estas fechas debe pasar por ahí, no reinventar con getters locales.

---

## To confirm

- ⚠ No hay ningún entorno de staging/preview documentado con datos separados de producción — confirmar antes de asumir que existe.

## El callback de invitación es público, la fijación de contraseña no

`/auth/confirm` debe poder recibir el `token_hash` sin sesión y es la única ruta pública de
confirmación en `proxy.ts`. `/auth/confirm/password` queda protegido por el gate de identidad:
`verifyOtp({ token_hash, type: "invite" })` establece las cookies y recién entonces se muestra
la pantalla que llama `updateUser({ password })`. No ampliar el bypass al subtree completo ni
registrar el token en logs o URLs posteriores.

## APP_URL y templates de invitación

`APP_URL` se valida como un origen HTTP/HTTPS sin credenciales, ruta, query ni hash. El service
construye `${APP_URL}/auth/confirm`; la allowlist de Supabase debe contener esa URL exacta. La
plantilla local vive en `supabase/templates/invite.html` y usa `TokenHash`/`RedirectTo`; en un
proyecto hosted se debe copiar esa plantilla al editor de Email Templates antes de invitar.
