---
type: Observability
version: metrics-alerting
validated: 2026-09-15
update_when: Cambian logging, tracing, thresholds, Sentry/Vercel integration o diagnóstico de base de datos
scope:
  - lib/observability
  - app/api/v1
  - lib/auth-context.ts
  - scripts/observability-db-report.ts
  - scripts/observability-vercel-report.sh
  - ops/vercel/alerts
---

# Observability — InmoTrack

## Request flow

`proxy.ts` conserva exclusivamente la renovación de sesión y el gate grueso de identidad. La observabilidad HTTP no vive en el proxy: cada Route Handler bajo `app/api/v1/**` se exporta envuelto por `withObservability(handler)`.

El wrapper:

1. reutiliza un `x-request-id` válido o genera uno nuevo;
2. abre un contexto request-scoped con `AsyncLocalStorage`;
3. mide duración;
4. ejecuta el handler sin cambiar su semántica HTTP;
5. devuelve `x-request-id` en la respuesta;
6. para 4xx emite `http.request.failed` en nivel `warn`;
7. para 5xx emite `http.request.failed` en nivel `error`;
8. para 2xx/3xx lentos emite `http.request.slow`;
9. no emite un log completo para requests exitosos normales.

`requireAuthenticatedUser()` agrega `userId` al contexto request-scoped. Los logs emitidos dentro de ese request heredan automáticamente `requestId`, `method`, `path` y `userId`.

## Seguridad de logs

Todo request/response capturado atraviesa `sanitizeForLogging()`.

- secretos, passwords, Authorization, cookies, tokens y API keys se reemplazan por `[REDACTED]`;
- multipart y contenido binario/PDF/imagen/audio/video no se serializan;
- el payload máximo loggable es 20 KiB por defecto;
- estructuras circulares se reemplazan por `[CIRCULAR]`;
- los logs nunca son el registro legal/auditable del negocio.

## Eventos de dominio

El catálogo vive en `lib/observability/events.ts`. Los eventos críticos se emiten en el límite HTTP después de que el service retorna exitosamente, para evitar registrar éxito antes de que una transacción haya confirmado.

Eventos iniciales instrumentados:

- `contract.created`
- `contract.activated`
- `contract.cancelled`
- `contract.activation_failed`
- `payment.created`
- `payment.failed`
- `settlement.generated`
- `settlement.failed`
- `expense.created`

El catálogo también reserva nombres para reversos/cancelaciones/updates futuros. No agregar logs narrativos de pasos internos si no representan un evento de negocio o una anomalía de dependencia.

## Thresholds

- `SLOW_REQUEST_THRESHOLD_MS`: default `2000` ms.
- `SLOW_QUERY_THRESHOLD_MS`: default `1000` ms.

Los valores se pueden ajustar por ambiente sin cambiar código.

## Base de datos

El proyecto Supabase remoto ya tiene `pg_stat_statements` operativo. No se necesita una migración para habilitarlo.

Para un reporte read-only:

```bash
set -a; . ./.env.local; set +a
npm run observability:db
```

El reporte consulta:

- top 10 queries por `total_exec_time`;
- top 10 queries por `mean_exec_time`;
- conexiones activas/totales y utilización sobre `max_connections`;
- cache hit ratio de tablas e índices;
- queries activas con más de un segundo.

No registra bind values ni ejecuta DDL.

## Vercel y Sentry

Vercel Runtime Logs recibe automáticamente las líneas JSON del logger. Web Analytics y Speed Insights están montados en el root layout.

Sentry usa `@sentry/nextjs` y queda opcional por ambiente. La ausencia de DSN no impide desarrollo/build. Los eventos incluyen `request_id`, usuario técnico cuando existe, environment y release/commit, sin PII innecesaria.

## Métricas HTTP agregadas

Los requests exitosos normales **no** generan un log propio. Request count, status code y latencia agregada se consultan sobre Vercel Observability, evitando duplicar telemetría y costo de logs.

Reporte operativo:

```bash
npm run observability:vercel
```

Variables opcionales:

```bash
VERCEL_PROJECT=inmotrack VERCEL_OBSERVABILITY_SINCE=7d npm run observability:vercel
```

El script primero muestra el schema de métricas `response` disponible para la cuenta y luego consulta `response_time` p50, p95 y p99 agrupado por route. También lista 5xx de producción. Si el schema de la cuenta usa un identificador distinto, se ajusta el script a partir de `vercel metrics schema response`; no se inventan IDs de métricas.

Dashboard operativo mínimo en Vercel:

- Request count por route/method/status.
- 5xx rate separado de 4xx.
- response time p50/p95/p99 por route.
- top routes por p95.
- Runtime Errors por route y deployment.
- Speed Insights: LCP, INP, CLS, FCP y TTFB.

SLO inicial:

- lecturas API: p95 < 500 ms;
- escrituras API: p95 < 800 ms;
- operaciones pesadas: p95 < 2000 ms.

Son objetivos iniciales y deben recalibrarse con tráfico real.

## Alertas

Las reglas versionadas viven en `ops/vercel/alerts/`.

Regla inicial disponible:

```bash
vercel alerts rules add --body ./ops/vercel/alerts/http-5xx-rate.json
```

`http-5xx-rate.json` dispara cuando la tasa 5xx supera 5% con al menos 20 requests en la ventana, para evitar ruido con tráfico mínimo.

Las alertas de p95, pool > 80% y queries lentas se activan después de obtener baseline y confirmar el schema/medida disponible en cada backend. No se versionan queries inventadas: primero se valida el schema real de Vercel y las métricas reales de Supabase.

## Dashboard DB mínimo

- top queries por `total_exec_time`;
- top queries por `mean_exec_time`;
- active connections / max connections;
- cache hit ratio;
- long-running queries;
- locks/blocking queries cuando aparezcan incidentes de concurrencia.

## Política de ruido

- 2xx/3xx normales: métricas de plataforma, sin body log.
- 2xx/3xx lentos: `http.request.slow`.
- 4xx: warning estructurado con payload sanitizado.
- 5xx: error estructurado + Sentry.
- eventos de negocio relevantes: log explícito.
- debug narrativo permanente: prohibido.

Una búsqueda del código base no debe introducir `console.log/debug/info` narrativos fuera de tooling puntual; todo log de aplicación debe pasar por la abstracción estructurada.
