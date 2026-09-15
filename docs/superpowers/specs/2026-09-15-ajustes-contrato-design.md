# Ajustes de contrato — diseño

**Issue:** #28  
**Estado:** aprobado  
**Fecha:** 2026-09-15

## Objetivo

Evitar que InmoTrack abra un nuevo período de alquiler con un `monto_base` desactualizado cuando el contrato requiere actualización periódica. El sistema detecta automáticamente cuándo corresponde actualizar, bloquea el avance, crea un ajuste pendiente auditable y permite que un operador cargue manualmente el nuevo monto antes de reanudar el cierre automático.

## Alcance

Incluye detección automática, persistencia auditable, bloqueo funcional del avance, aplicación manual por ADMIN/EMPLEADO, reencolado tras aplicar, API/UI, historial, alerta de Dashboard e idempotencia/concurrencia.

Fuera de alcance: obtener ICL/IPC de APIs externas, calcular `ACUERDO`, modificar períodos cerrados o generar `Cargo AJUSTE` por una actualización ordinaria.

## Decisiones funcionales

### El ajuste modifica el alquiler base

Una actualización ordinaria cambia `Contrato.monto_base`. No genera un cargo adicional. El `Cargo ALQUILER` del período efectivo se crea directamente con el nuevo monto.

### Regla temporal

La fecha base es `fecha_ultimo_ajuste ?? fecha_inicio`. Un nuevo período requiere ajuste cuando su mes calendario alcanza el primer período ubicado `meses_act` meses después de esa base. Ejemplo: inicio enero 2026, `meses_act = 3` → enero, febrero y marzo usan el monto vigente; abril requiere ajuste.

Si `indice_act` o `meses_act` es `null`, el cierre continúa sin ajuste automático.

### Ajuste pendiente como condición esperada

Cuando el motor intenta avanzar y detecta que el siguiente período requiere actualización:

1. crea o reutiliza un `AjusteContrato(PENDIENTE)`;
2. no cierra el período actual;
3. no abre el nuevo período;
4. no consume retries del outbox;
5. la fila actual del outbox termina correctamente.

### Aplicación manual

El operador carga `monto_nuevo > 0` y observación opcional. En una única transacción se bloquean ajuste y contrato, se verifica `PENDIENTE`, se actualizan `monto_base` y `fecha_ultimo_ajuste`, se marca `APLICADO` con usuario/timestamp y se crea una fila `PENDIENTE` en `outbox_cierre_periodo` si no existe otra pendiente.

El cron reanuda el flujo normal y abre el período efectivo con el nuevo monto.

### Catch-up

Si un contrato está atrasado varios meses, el worker avanza hasta el primer período que requiere ajuste y se detiene allí. Tras aplicarlo, continúa desde ese punto sin saltar ni recrear períodos previos.

## Modelo de datos

Nueva entidad `AjusteContrato`:

```text
id: Int
id_contrato: Int
periodo_efectivo: String(7)
indice: IndiceActualizacion
monto_anterior: Decimal(15,2)
monto_nuevo: Decimal(15,2)?
estado: PENDIENTE | APLICADO
observacion: String?
creado_en: DateTime
aplicado_en: DateTime?
id_usuario_aplicador: Int?
```

Restricciones: `UNIQUE(id_contrato, periodo_efectivo)` e índice por `estado`. Relaciones: `Contrato.ajustes` y `Usuario.ajustes_aplicados`.

## Dominio

Crear `lib/ajustes-contrato.ts` con helpers puros para decidir si un período requiere ajuste usando UTC/@db.Date y períodos `YYYY-MM`.

Crear `services/ajustes-contrato.service.ts` con `listarPorContrato`, `obtenerPendiente`, `crearOReutilizarPendiente` y `aplicar`.

`ContratosService.avanzarPeriodo` verifica antes de cerrar el período actual y devuelve uno de:

```ts
{ estado: "AVANZADO" }
{ estado: "AJUSTE_PENDIENTE", ajusteId: number }
```

`CierrePeriodosService.procesarUnaFilaDeCola` corta el loop ante `AJUSTE_PENDIENTE` y marca la fila `COMPLETADO`, sin incrementar intentos.

## API

```text
GET  /api/v1/contratos/{id}/ajustes
POST /api/v1/contratos/{id}/ajustes/{idAjuste}/aplicar
```

GET requiere sesión. POST permite ADMIN/EMPLEADO y bloquea AUDITOR. Body:

```json
{ "monto_nuevo": 600000, "observacion": "Actualización trimestral ICL" }
```

## UI

En contratos: badge `Ajuste pendiente`, acción `Actualizar alquiler`, modal con índice/monto/período/nuevo monto/observación e historial de actualizaciones.

En Dashboard Operativo: KPI/alerta de contratos bloqueados por ajuste pendiente con enlace a contratos.

La UI reutiliza tokens/componentes existentes y no agrega dependencias.

## Concurrencia y errores

- ajuste inexistente/de otro contrato: error de negocio;
- ajuste ya aplicado: rechazo determinista;
- `monto_nuevo <= 0`: validación Zod;
- detección concurrente: una fila por `@@unique`;
- aplicación concurrente: lock pesimista, un único cambio de estado;
- reencolado duplicado: una sola fila `PENDIENTE` activa por contrato mediante chequeo transaccional.

## Testing

Cubrir regla pura (1/3/4/6/12 meses), cambio de año, contratos sin política, primer/siguiente ajuste, creación idempotente, no-cierre ante pendiente, cron sin retries, aplicación transaccional, concurrencia, catch-up, crédito heredado, API/auth, UI e indicador de Dashboard.

## Documentación afectada

Actualizar `docs/agent/overview.md`, `architecture.md`, `contracts.md`; `runbook.md` si cambia el flujo operativo/migratorio; `traps.md` solo ante un gotcha nuevo.

## Criterios de aceptación

- Nunca se abre un período con monto viejo cuando corresponde actualizar.
- Un contrato/período tiene como máximo un ajuste.
- Un ajuste pendiente no consume retries del outbox.
- El operador puede aplicar manualmente el nuevo monto.
- `monto_base` y `fecha_ultimo_ajuste` cambian transaccionalmente con el ajuste.
- El cierre se reanuda tras aplicar.
- Existe historial auditable y visibilidad en Contratos/Dashboard.
- No se modifican períodos cerrados ni se calculan índices automáticamente.
