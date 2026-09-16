# InmoTrack Observability Design

## Objetivo

Implementar observabilidad transversal de aplicación, HTTP, frontend y base de datos con alta señal y bajo ruido.

## Arquitectura

- Vercel Observability: runtime logs, requests, status codes, funciones, deployments y latencia.
- Web Analytics + Speed Insights: uso y Core Web Vitals.
- Middleware de aplicación `withObservability(handler)`: requestId, duración, 4xx/5xx, request/response sanitizados y slow requests.
- Structured logger: JSON, contexto común y eventos de dominio.
- Sentry: errores browser/server, stack traces, user/request/deployment correlation.
- PostgreSQL/Supabase: `pg_stat_statements`, slow queries, conexiones, cache hit ratio y long-running queries.

## Política de logs

No se mantienen logs narrativos permanentes. Se conservan tres familias:

1. HTTP anómalo: 4xx/5xx y requests lentas.
2. Eventos de negocio relevantes: contratos, pagos, liquidaciones y gastos.
3. Dependencias/anomalías: query lenta, storage/API externa fallida, estados inesperados.

## HTTP middleware

No se usará `proxy.ts` para capturar body/response. En Next.js 16 `proxy.ts` conserva su responsabilidad de sesión/auth gruesa. La observabilidad HTTP se implementa como wrapper de Route Handlers:

```ts
export const POST = withObservability(async (req) => { ... })
```

Responsabilidades: reutilizar/generar `x-request-id`, medir duración, ejecutar handler, inspeccionar status, sanitizar input/output, loguear 4xx como warn y 5xx como error, detectar slow requests, devolver `x-request-id` y propagar contexto a Sentry.

## Seguridad

Nunca loguear secretos, Authorization, cookies, passwords, access/refresh tokens, API keys, binarios ni multipart. Request/response se truncan a 20 KB y el sanitizer es centralizado.

## Latencia

Métricas por route/method/environment/status: count, error count, error rate, p50, p95 y p99. SLO inicial: reads p95 < 500 ms, writes p95 < 800 ms, operaciones pesadas p95 < 2 s. Slow request general inicial: > 2 s.

## Base de datos

Usar `pg_stat_statements` y métricas Supabase. Métricas iniciales: query p95, top por total_exec_time, top por mean_exec_time, active connections, connection utilization, cache hit ratio y long-running queries. Slow query inicial: > 1000 ms.

## Eventos de dominio iniciales

- contract.created / activated / cancelled / activation_failed
- payment.created / reversed / failed
- settlement.generated / cancelled / failed
- expense.created / updated / deleted

## Alertas iniciales

Activar luego de obtener baseline: 5xx > 5%, p95 > 2 s, query > 1 s, pool > 80%, settlement.failed, contract.activation_failed y payment.failed.

## PR stack

1. Observability foundation: Analytics, Speed Insights, logger, sanitizer, requestId.
2. HTTP + Sentry: withObservability, 4xx/5xx, latencia, correlation y Sentry.
3. Domain observability: eventos de negocio y limpieza de logs de bajo valor.
4. Database + performance: pg_stat_statements, slow queries, métricas, dashboards y alertas.
