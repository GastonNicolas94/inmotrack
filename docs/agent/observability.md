---
type: Observability
version: bc936d1
validated: 2026-09-15
update_when: Cambian logging, tracing, thresholds, Sentry/Vercel integration o diagnóstico de base de datos
scope:
  - lib/observability
  - app/api/v1
  - lib/auth-context.ts
  - scripts/observability-db-report.ts
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

Vercel Runtime Logs recibe automáticamente las líneas JSON del logger. Web Analytics y Speed Insights requieren sus paquetes oficiales y montaje en el root layout; la instalación debe regenerar `package-lock.json`, nunca editarlo manualmente.

Sentry debe integrarse con `@sentry/nextjs` y quedar opcional por ambiente. La ausencia de DSN no debe impedir desarrollo/build. Los eventos de Sentry deben incluir `request_id`, usuario técnico cuando exista, environment y release/commit, sin PII innecesaria.

## Señales operativas iniciales

- HTTP: 5xx rate, p50/p95/p99 y slow routes.
- DB: top total/mean query time, conexiones, cache hit ratio y long-running queries.
- Frontend: LCP, INP, CLS, FCP y TTFB con Speed Insights.

Los thresholds de alertas deben activarse después de obtener baseline real para evitar ruido. Referencia inicial: 5xx > 5%, request p95 > 2 s, query > 1 s y pool > 80%.
