---
type: Capability
version: contract-rent-adjustments-queue
validated: 2026-09-16
update_when: cambia el alta de contratos, la lógica de ajustes periódicos o la entrega de cierres
scope:
  - components/features/contratos/WizardContrato.tsx
  - schemas/contrato.schema.ts
  - services/ajustes-contrato.service.ts
  - services/cierre-periodos.service.ts
  - services/cierre-periodos-queue.service.ts
  - app/api/queues/cierre-periodos/route.ts
  - app/api/v1/cron/recuperar-cola-cierre/route.ts
---

# Ajustes periódicos de contratos

Los ajustes automáticos se configuran al crear el contrato mediante dos campos relacionados:

- `indice_act`: `ICL`, `IPC` o `ACUERDO`. Si no se informa, el contrato no participa del flujo automático de ajustes.
- `meses_act`: frecuencia en meses. En el wizard se ofrecen 3, 4, 6 y 12 meses.

Si se selecciona `indice_act`, `meses_act` es obligatorio en `contratoSchema`. El wizard muestra la frecuencia únicamente cuando existe un índice de actualización seleccionado y envía ambos valores en el `POST /api/v1/contratos`.

El motor usa como fecha base `fecha_ultimo_ajuste ?? fecha_inicio`. Cuando se alcanza el siguiente límite de `meses_act`, el cierre del período se detiene con un ajuste pendiente. El operador carga manualmente el nuevo monto; esta versión no consulta APIs externas de ICL/IPC.

## Reanudación mediante Vercel Queue

Aplicar un ajuste actualiza contrato + historial y garantiza una fila `outbox_cierre_periodo(PENDIENTE)` dentro de la misma transacción de PostgreSQL. Al terminar el commit, la ruta publica `{ outboxId }` en el topic `cierre-periodos` mediante `@vercel/queue`.

El subscriber `app/api/queues/cierre-periodos/route.ts` consume ese id exacto. `CierrePeriodosService.procesarFilaDeCola(outboxId)` reclama la fila únicamente si sigue `PENDIENTE`; una entrega duplicada sobre una fila ya reclamada/completada es un no-op. La clave de publicación `cierre-periodo:<outboxId>` es estable.

El flujo no usa `after()` ni self-fetch HTTP. El cron mensual crea/reutiliza las outboxes necesarias y publica sus ids directamente a Queue. Un cron de recuperación busca filas `PENDIENTE` antiguas y las republica para cubrir el caso `COMMIT PostgreSQL OK / publicación Queue fallida`.

PostgreSQL sigue siendo la fuente durable de verdad; Vercel Queue es el mecanismo de entrega y ejecución. Un fallo de publicación no revierte el ajuste ya aplicado: la outbox queda `PENDIENTE` para recuperación.
