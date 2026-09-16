---
type: Capability
version: contract-rent-adjustments
validated: 2026-09-16
update_when: cambia el alta de contratos o la lógica de ajustes periódicos
scope:
  - components/features/contratos/WizardContrato.tsx
  - schemas/contrato.schema.ts
  - services/ajustes-contrato.service.ts
---

# Ajustes periódicos de contratos

Los ajustes automáticos se configuran al crear el contrato mediante dos campos relacionados:

- `indice_act`: `ICL`, `IPC` o `ACUERDO`. Si no se informa, el contrato no participa del flujo automático de ajustes.
- `meses_act`: frecuencia en meses. En el wizard se ofrecen 3, 4, 6 y 12 meses.

Si se selecciona `indice_act`, `meses_act` es obligatorio en `contratoSchema`. El wizard muestra la frecuencia únicamente cuando existe un índice de actualización seleccionado y envía ambos valores en el `POST /api/v1/contratos`.

El motor usa como fecha base `fecha_ultimo_ajuste ?? fecha_inicio`. Cuando se alcanza el siguiente límite de `meses_act`, el cierre del período se detiene con un ajuste pendiente. El operador carga manualmente el nuevo monto; esta versión no consulta APIs externas de ICL/IPC.
