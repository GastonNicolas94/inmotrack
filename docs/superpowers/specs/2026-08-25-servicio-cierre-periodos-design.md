# Servicio de Cierre de Períodos — Diseño

## 1. Contexto y problema

`ContratosService.avanzarPeriodo` existe y funciona (cierra el período `ABIERTO` de un contrato, cristaliza `credito_al_cierre`, abre el siguiente con `credito_heredado` aplicado) pero es 100% manual — no hay ninguna ruta API, botón de UI, ni disparador automático que lo invoque. Todos los contratos activos quedan con el mismo período abierto para siempre hasta que alguien llame la función a mano (hoy solo pasa en el seed y en los tests).

Este spec diseña el "motor de tiempo" que faltaba, explícitamente fuera de alcance del spec anterior (`2026-08-23-motor-periodos-movimientos-design.md`, sección 7): quién dispara el avance de un período, cuándo corresponde, y cómo se sostiene el trabajo sin bloquear ni arriesgar timeouts en un entorno serverless (Vercel).

Explícitamente fuera de este spec: generación automática de punitorios (`pct_punitorio_diario` sigue sin usarse en ningún código real, es una vuelta aparte), y feriados argentinos en el ajuste de día hábil (solo se corre fin de semana).

## 2. Decisiones de diseño

**Disparador: cron mensual, no botón manual.** Vercel Cron invoca un endpoint una vez al mes. `middleware.ts` ya exceptúa `/api/v1/cron/*` de auth de sesión — se protege en su lugar con un secret compartido (`CRON_SECRET`), que Vercel Cron manda automáticamente como `Authorization: Bearer <CRON_SECRET>` en cada invocación programada.

**Cuándo cierra un período.** Un período `ABIERTO` cierra al terminar su propio mes calendario (período "2026-08" cierra el 31/8 a las 23:59, hora Argentina) — independiente de su `fecha_vencimiento` (que es un concepto distinto: el límite de cobranza usado para `calcularEstadoCobranza`, no el momento de cierre).

**Fecha de vencimiento del período nuevo: día 10 del mismo mes, ajustado a día hábil.** Esto corrige un bug real en `ContratosService.activar()`: hoy calcula `Date.UTC(anio, mes, 10)` donde `mes` ya es 1-based (setiembre=9) — pasado como argumento 0-based a `Date.UTC`, da **octubre**, un mes después de lo que debería. La regla correcta, confirmada con el usuario: día 10 del **mismo** mes del período, corrido al lunes siguiente si cae sábado o domingo.

```ts
// lib/fecha.ts (se agrega a lo que ya existe)
export function calcularVencimientoPeriodo(anio: number, mes: number): Date {
  let vencimiento = new Date(Date.UTC(anio, mes - 1, 10));
  const diaSemana = vencimiento.getUTCDay(); // 0=domingo, 6=sábado
  if (diaSemana === 6) vencimiento = new Date(Date.UTC(anio, mes - 1, 12));
  if (diaSemana === 0) vencimiento = new Date(Date.UTC(anio, mes - 1, 11));
  return vencimiento;
}
```

`ContratosService.activar()` pasa a usar esta función (fix del bug existente); el nuevo mecanismo de cierre la usa igual, para no duplicar la regla.

**"Qué mes es hoy" se calcula con timezone explícito, nunca con el timezone del proceso.** Vercel corre las funciones serverless en UTC por default salvo que se fuerce lo contrario — confiar en `new Date().getMonth()` filtraría mal en la ventana de 21:00 a 23:59 hora Argentina del último día de cada mes (ya sería el día siguiente en UTC). Se resuelve con `Intl.DateTimeFormat` fijando `timeZone: "America/Argentina/Buenos_Aires"` explícitamente:

```ts
// lib/fecha.ts
export function hoyEnArgentina(): { anio: number; mes: number; dia: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (tipo: string) => Number(partes.find((p) => p.type === tipo)!.value);
  return { anio: get("year"), mes: get("month"), dia: get("day") };
}
```

**Patrón outbox + auto-invocación encadenada, no procesamiento síncrono en el cron.** El cron dispara y se olvida — no espera nada. Todo el trabajo pesado (potencialmente muchos contratos, cada uno con su propia cadena de `avanzarPeriodo`) se desacopla en una tabla (`OutboxCierrePeriodo`) y se procesa de a un registro por vez, en una cadena de invocaciones HTTP que se disparan a sí mismas sin que nadie quede esperando. Se descartaron:
- **Procesar todo síncrono dentro del cron**: riesgo real de timeout de function si hay muchos contratos o alguno tarda.
- **Cola/broker externo (SQS, Redis)**: sobre-ingeniería para este tamaño de proyecto, sin esa infraestructura hoy.

**Reintentos: automáticos, con límite, sin intervención humana para errores transitorios.** Cada fila de la cola tiene un contador `intentos`. Si `avanzarPeriodo` falla, se reintenta esa misma fila hasta 3 veces dentro de la misma cadena (sin backoff, reintento inmediato); si sigue fallando, queda en `ERROR` definitivo — la corrida mensual siguiente del cron va a volver a encontrar ese contrato con período vencido y generar una fila nueva de todas formas, así que no hace falta un mecanismo de reintento manual separado.

**Dos filas nunca se procesan al mismo tiempo, aunque la cadena se rompa.** La cadena de auto-invocación es secuencial por construcción (cada invocación dispara la siguiente solo después de terminar la suya), pero eso no alcanza como única protección — un doble disparo del cron, un retry de red que duplica el `fetch` de `after()`, etc. podrían en teoría generar dos invocaciones concurrentes. La protección real es que "tomar" una fila es un único `UPDATE` atómico con `FOR UPDATE SKIP LOCKED` sobre la subconsulta y un re-chequeo de `estado = 'PENDIENTE'` en el `WHERE` externo:

```sql
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
RETURNING *;
```

Si dos invocaciones corrieran en paralelo, la primera bloquea la fila con `FOR UPDATE SKIP LOCKED`; la segunda automáticamente salta a la siguiente fila disponible (o no encuentra ninguna y termina sin hacer nada) — nunca las dos toman la misma.

## 3. Modelo de datos

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

Sin cambios en `PeriodoPago`, `Cargo`, `Contrato` ni ningún otro modelo existente — este spec solo agrega la tabla de cola y usa `ContratosService.avanzarPeriodo` tal cual ya existe.

## 4. Flujo completo

```
Vercel Cron (1 vez al mes)
  → GET /api/v1/cron/activar-cierre-periodos
      Header: Authorization: Bearer <CRON_SECRET>

      1. hoyEnArgentina() → { anio, mes }
      2. Busca Contrato con estado ACTIVO o MOROSO cuyo período ABIERTO
         tenga periodo < "anio-mes" actual (mes calendario ya terminado).
      3. Por cada uno, INSERT en OutboxCierrePeriodo (estado: PENDIENTE) —
         una fila por contrato, no por mes de atraso (el catch-up de
         varios meses vive dentro del procesamiento de esa fila). Si ese
         contrato ya tiene una fila PENDIENTE o PROCESANDO sin resolver
         (de una corrida anterior que todavía no terminó), no se inserta
         una segunda — evita duplicar trabajo sobre el mismo contrato.
      4. Dentro de un after() (Next.js) — para que el fetch salga antes
         de que la función termine — dispara sin esperar:
         POST /api/v1/cron/procesar-cola-cierre
      5. Responde 200. Termina. No espera nada.

POST /api/v1/cron/procesar-cola-cierre
      Header: Authorization: Bearer <CRON_SECRET>

      1. UPDATE atómico: toma la fila PENDIENTE más vieja, la marca
         PROCESANDO (UPDATE ... WHERE estado='PENDIENTE' ... RETURNING *,
         para que dos invocaciones concurrentes nunca tomen la misma fila).
      2. Si no hay ninguna fila PENDIENTE → responde 200 y termina
         (la cadena se apaga sola).
      3. Si hay una: antes de tocar nada, vuelve a leer fresco el período
         ABIERTO actual de ese contrato y compara contra hoyEnArgentina()
         — doble chequeo, no confía en que la fila siga vigente. Puede
         no estarlo (alguien ya lo avanzó por otro lado, o quedó
         adelantado por un reintento anterior de esta misma fila que
         avanzó algún mes antes de fallar). Si ya está al día, no llama
         avanzarPeriodo — pasa directo al paso 4 como éxito sin trabajo.
         Si sigue atrasado, corre la cadena de avanzarPeriodo para ese
         contrato (mismo mecanismo de "avanza mes por mes hasta ponerse
         al día" que ya usa avanzarPeriodo, repetido tantas veces como
         meses de atraso tenga — releyendo el período abierto en cada
         vuelta de esa cadena, no una sola vez al principio).
      4. Si tuvo éxito → marca la fila COMPLETADO, procesado_en = ahora.
         Si falló → intentos += 1; si intentos < 3, vuelve a PENDIENTE
         (se reintenta en la próxima vuelta de esta misma cadena); si
         no, marca ERROR con el detalle.
      5. Dispara (sin esperar, dentro de after()) otra invocación de
         POST /api/v1/cron/procesar-cola-cierre — siga habiendo o no
         más filas PENDIENTE, ese siguiente request decide en su propio
         paso 2 si hay más trabajo o se apaga.
      6. Responde 200.
```

## 5. Impacto en código

**Nuevo:**
- `prisma/migrations/.../` — tabla `OutboxCierrePeriodo` + enum `EstadoOutboxCierre`.
- `lib/fecha.ts` — se agregan `calcularVencimientoPeriodo` y `hoyEnArgentina` a lo que ya existe (`partesFechaUTC`, `formatFechaLocal`).
- `services/cierre-periodos.service.ts` — `encolarContratosVencidos()` (paso de encolado) y `procesarUnaFilaDeCola()` (paso de procesamiento, con la lógica de reintento).
- `app/api/v1/cron/activar-cierre-periodos/route.ts` — GET, valida `CRON_SECRET`, llama `encolarContratosVencidos()`, dispara `procesarUnaFilaDeCola` vía `after()`.
- `app/api/v1/cron/procesar-cola-cierre/route.ts` — POST, valida `CRON_SECRET`, llama `procesarUnaFilaDeCola()`, se re-dispara a sí mismo vía `after()` si corresponde.
- `vercel.json` — define el cron mensual apuntando a `/api/v1/cron/activar-cierre-periodos`.
- Variable de entorno nueva: `CRON_SECRET`.

**Modificado:**
- `services/contratos.service.ts` — `activar()` pasa a usar `calcularVencimientoPeriodo` en vez de su cálculo actual (fix del bug de mes).

**Sin cambios:** `ContratosService.avanzarPeriodo`, `aplicarCreditoDisponible`, y todo el resto del motor financiero — este spec solo agrega el disparador automático y el mecanismo de cola, reutilizando `avanzarPeriodo` tal cual.

## 6. Testing

- `lib/fecha.ts`: tests para `calcularVencimientoPeriodo` (caso normal, cae sábado, cae domingo) y `hoyEnArgentina` (con `Intl` real, sin mockear `Date`, verificando que devuelve la fecha correcta independientemente del timezone del proceso que corre el test).
- `services/cierre-periodos.service.ts`: tests con `node:test` contra la base real (mismo patrón que el resto del proyecto) — encolar solo contratos vencidos, no encolar `BORRADOR`/`RESCINDIDO`/`VENCIDO`, catch-up de varios meses en una sola fila, reintento con límite de 3, marcar `ERROR` definitivo, que un contrato con error no bloquee el procesamiento de otros.
- Los endpoints HTTP (`activar-cierre-periodos`, `procesar-cola-cierre`) se prueban con tests de integración que validan el rechazo sin `CRON_SECRET` correcto, y que invocan los servicios sin depender del mecanismo real de `after()` (se testea la lógica de encolado/procesamiento por separado del disparo asíncrono en sí).

## 7. Fuera de alcance

- Generación automática de `Cargo PUNITORIO` sobre deuda vencida.
- Feriados argentinos en el ajuste de día hábil (solo fines de semana).
- UI para ver el estado de la cola (`OutboxCierrePeriodo`) — hoy solo se audita por base de datos.
- Reintento manual desde la UI para filas en `ERROR` definitivo — la corrida mensual siguiente ya las vuelve a generar.
- Notificaciones (email/Slack) ante filas en `ERROR` definitivo.
