# Ajustes de contrato Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detectar actualizaciones periódicas de alquiler, bloquear el avance con monto viejo, permitir aplicar manualmente el nuevo monto y reanudar el cierre automático de forma auditable e idempotente.

**Architecture:** La regla temporal vive en un helper puro; `AjustesContratoService` encapsula persistencia, locks y aplicación; `ContratosService.avanzarPeriodo` retorna un resultado de negocio explícito; `CierrePeriodosService` trata `AJUSTE_PENDIENTE` como condición esperada. La UI consume rutas REST finas y el Dashboard agrega el conteo de pendientes.

**Tech Stack:** TypeScript, Next.js 16 App Router, Prisma 7, PostgreSQL/Supabase, Zod, node:test, Tailwind v4/shadcn.

**Spec:** `docs/superpowers/specs/2026-09-15-ajustes-contrato-design.md`

## Global Constraints

- No integrar APIs externas de ICL/IPC en esta versión.
- Una actualización ordinaria modifica `Contrato.monto_base`; no crea `Cargo AJUSTE`.
- No modificar períodos ya cerrados.
- Un ajuste pendiente no consume retries técnicos del outbox.
- Toda operación multi-tabla debe ser transaccional.
- Respetar `@db.Date`/UTC y períodos `YYYY-MM`.
- No agregar dependencias de UI ni colores Tailwind crudos.
- Actualizar `docs/agent/*` afectados en el mismo cambio.

---

### Task 1: Regla pura de calendario de ajustes

**Files:**
- Create: `lib/ajustes-contrato.ts`
- Create: `tests/lib/ajustes-contrato.test.ts`

**Interfaces:**
- Produces: `requiereAjuste({ fechaInicio, fechaUltimoAjuste, mesesActualizacion, indiceActualizacion, periodoObjetivo }): boolean`
- Produces: `fechaPeriodo(periodo: string): Date`

- [ ] Escribir tests que cubran 1/3/4/6/12 meses, cambio de año, contrato sin política y uso de `fecha_ultimo_ajuste`.
- [ ] Ejecutar `node --import tsx --test tests/lib/ajustes-contrato.test.ts` y verificar FAIL inicial.
- [ ] Implementar parsing estricto `YYYY-MM`, aritmética mensual UTC y regla `meses_act`.
- [ ] Reejecutar el archivo y verificar PASS.

### Task 2: Persistencia y migración

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `supabase/migrations/<timestamp>_ajustes_contrato.sql`
- Modify: `tests/helpers/db.ts` si la lista de truncado es explícita.

**Interfaces:**
- Produces: `AjusteContrato`, `EstadoAjusteContrato`, relaciones desde `Contrato` y `Usuario`.
- Constraint: `@@unique([id_contrato, periodo_efectivo])`, `@@index([estado])`.

- [ ] Agregar modelos/enums Prisma con Decimal(15,2), fechas y FK de usuario aplicador.
- [ ] Crear SQL equivalente para Supabase incluyendo unique/index/FKs.
- [ ] Ajustar helper destructivo de tests si enumera tablas manualmente.
- [ ] Validar que nombres SQL mapeen a `ajustes_contrato` y enum correspondiente.

### Task 3: Servicio de ajustes con idempotencia y locks

**Files:**
- Create: `services/ajustes-contrato.service.ts`
- Create: `tests/services/ajustes-contrato.service.test.ts`

**Interfaces:**
- Produces: `listarPorContrato(idContrato)`
- Produces: `obtenerPendiente(idContrato)`
- Produces: `crearOReutilizarPendiente(tx, contrato, periodoEfectivo)`
- Produces: `aplicar(idContrato, idAjuste, { monto_nuevo, observacion? }, idUsuarioAplicador)`

- [ ] Escribir tests DB para creación pendiente e idempotencia por contrato/período.
- [ ] Escribir test de aplicación: actualiza `monto_base`, `fecha_ultimo_ajuste`, `estado`, usuario/timestamp y reencola.
- [ ] Escribir test de doble aplicación/rechazo determinista.
- [ ] Implementar creación con upsert/find-after-unique-race.
- [ ] Implementar aplicación con `SELECT ... FOR UPDATE` sobre ajuste/contrato y chequeo transaccional de outbox pendiente.

### Task 4: Integrar guard en avance de períodos

**Files:**
- Modify: `services/contratos.service.ts`
- Modify: `tests/services/contratos.service.test.ts`

**Interfaces:**
- `avanzarPeriodo(...)` retorna `{ estado: "AVANZADO" } | { estado: "AJUSTE_PENDIENTE"; ajusteId: number }`.

- [ ] Escribir test que confirme que el período actual sigue `ABIERTO` y no aparece el siguiente cuando corresponde ajuste.
- [ ] Escribir test de avance normal sin política.
- [ ] Escribir test de avance post-aplicación usando nuevo `monto_base` y preservando crédito heredado.
- [ ] Antes de cerrar el período, invocar `requiereAjuste`; si corresponde, crear/reutilizar pendiente y retornar `AJUSTE_PENDIENTE`.
- [ ] Mantener la apertura actual sin cambios cuando retorna `AVANZADO`.

### Task 5: Integrar condición funcional con cierre automático

**Files:**
- Modify: `services/cierre-periodos.service.ts`
- Modify: `tests/services/cierre-periodos.service.test.ts`

**Interfaces:**
- Consumes: resultado explícito de `ContratosService.avanzarPeriodo`.

- [ ] Escribir test de worker que llega a ajuste pendiente y deja `intentos` intacto con outbox `COMPLETADO`.
- [ ] Escribir test de catch-up: avanza meses previos, se detiene exactamente en período efectivo, aplica ajuste y después continúa.
- [ ] Cambiar loop para `break` ante `AJUSTE_PENDIENTE`.
- [ ] Mantener catch/retry exclusivamente para excepciones.

### Task 6: API y validación

**Files:**
- Create: `schemas/ajuste-contrato.schema.ts`
- Create: `app/api/v1/contratos/[id]/ajustes/route.ts`
- Create: `app/api/v1/contratos/[id]/ajustes/[idAjuste]/aplicar/route.ts`
- Add/Modify tests de routes/auth siguiendo patrones existentes.

**Interfaces:**
- GET `/api/v1/contratos/{id}/ajustes`
- POST `/api/v1/contratos/{id}/ajustes/{idAjuste}/aplicar`
- Body: `{ monto_nuevo: number positivo, observacion?: string }`

- [ ] Definir Zod con monto positivo y observación opcional acotada.
- [ ] Implementar GET con sesión autenticada.
- [ ] Implementar POST con `assertCanWrite`, usuario actual y serialización Decimal/Date consistente.
- [ ] Cubrir AUDITOR bloqueado y errores de ajuste inválido/aplicado.

### Task 7: UI de contratos e historial

**Files:**
- Modify: `services/contratos.service.ts` select/list/detail para exponer ajuste pendiente mínimo.
- Modify/Create bajo `components/features/contratos/` para badge, modal e historial.
- Modify: página/tabla de contratos correspondiente.

**Interfaces:**
- Badge `Ajuste pendiente`.
- Acción `Actualizar alquiler` abre modal con índice, monto actual, período efectivo, nuevo monto y observación.
- Historial ordenado descendente por período/creación.

- [ ] Reutilizar tokens semánticos y primitivas shadcn existentes.
- [ ] En submit POST aplicar ajuste, mostrar feedback y refrescar ruta.
- [ ] Ocultar acción cuando no haya pendiente; AUDITOR no debe ver acción de escritura.
- [ ] Renderizar historial sin duplicar lógica de formato monetario existente.

### Task 8: Dashboard operativo

**Files:**
- Modify: `services/dashboard.service.ts`
- Modify: `lib/dashboard/types.ts`
- Modify componentes de solapa Operativo.
- Modify tests puros/service del Dashboard.

**Interfaces:**
- Nuevo contador/lista de ajustes `PENDIENTE` enlazable a contratos.

- [ ] Agregar query mínima por estado `PENDIENTE`.
- [ ] Exponer DTO serializable sin `Prisma.Decimal`.
- [ ] Mostrar alerta/KPI solo con pendientes reales.
- [ ] Agregar prueba de cero y múltiples pendientes.

### Task 9: Documentación y verificación final

**Files:**
- Modify: `docs/agent/overview.md`
- Modify: `docs/agent/architecture.md`
- Modify: `docs/agent/contracts.md`
- Modify: `docs/agent/runbook.md` solo si hace falta documentar migración/operación adicional.
- Modify: `docs/agent/traps.md` solo si aparece un gotcha nuevo.

- [ ] Documentar nueva capability, flujo de cierre bloqueado y rutas HTTP.
- [ ] Actualizar frontmatter `version`/`validated` según regla del repo.
- [ ] Ejecutar tests puros de ajustes.
- [ ] Ejecutar tests DB afectados de forma secuencial y solo contra Supabase local canónico.
- [ ] Ejecutar `npm run build` como type-check real.
- [ ] Revisar diff contra spec: sin placeholders, sin API externa, sin `Cargo AJUSTE` accidental.
- [ ] Abrir PR de `feat/contract-rent-adjustments` hacia `develop` enlazando `#28`.
