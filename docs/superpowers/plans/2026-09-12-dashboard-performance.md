# Dashboard Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar feedback inmediato al navegar y reducir el tiempo real de los listados sin abandonar el render server-side ni debilitar la seguridad.

**Architecture:** El frente perceptual usa `loading.tsx`, `useLinkStatus` y límites `Suspense`. El frente real mide primero, reduce selecciones Prisma y agrega únicamente índices respaldados por evidencia.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Prisma 7, PostgreSQL/Supabase, node:test y Vercel.

**Spec:** `docs/superpowers/specs/2026-09-12-dashboard-performance-design.md`

## Branch and PR stack

```text
develop
└── epic/dashboard-performance
    └── feat/dashboard-navigation-feedback       PR 1 → epic/dashboard-performance
        └── perf/dashboard-query-payload         PR 2 → feat/dashboard-navigation-feedback
            └── perf/dashboard-measured-indexes  PR 3 → perf/dashboard-query-payload
```

Después de aprobar cada PR interno, integrar la pila en `epic/dashboard-performance`. El único PR hacia `develop` será `epic/dashboard-performance → develop`.

## Global Constraints

- Mantener Server Components para lecturas y Client Components solo para estado/interacción.
- No ejecutar tests destructivos contra una base remota ni contra datos que deban conservarse.
- No usar `prisma migrate dev`; seguir el flujo de migraciones documentado por la rama base.
- No cachear datos dependientes de sesión, rol o finanzas sin invalidación explícita.
- Usar tokens visuales existentes y actualizar `docs/agent/` con cada cambio arquitectónico.
- Seguir RED → GREEN → REFACTOR para comportamiento nuevo; la prueba debe ejercitar comportamiento real, no buscar texto fuente.

---

### Task 1: Baseline reproducible

**Files:**
- Create: `.superpowers/sdd/2026-09-12-dashboard-performance/baseline.md`
- Modify: ninguno versionado

**Interfaces:**
- Consumes: logs Vercel del Preview vigente y las rutas `/contratos`, `/propietarios`, `/propiedades`, `/inquilinos`, `/pagos`, `/gastos`, `/liquidaciones`, `/transacciones`.
- Produces: mediana fría/cálida por ruta y ranking de rutas lentas.

- [ ] Registrar tres muestras recientes por ruta desde Vercel, separando deployment, status y duración.
- [ ] Marcar como inválida cualquier muestra con error Prisma/TLS.
- [ ] Registrar qué rutas carecen de evidencia suficiente; no inventar valores.
- [ ] Guardar tabla y conclusión en `baseline.md`.

---

### Task 2: Fallback inmediato del dashboard

**Files:**
- Create: `components/layout/DashboardLoadingSkeleton.tsx`
- Create: `app/(dashboard)/loading.tsx`
- Modify: `docs/agent/architecture.md`

**Interfaces:**
- Consumes: `DashboardShell` y tokens de `app/globals.css`.
- Produces: `DashboardLoadingSkeleton()` usado por el convention file `loading.tsx`.

- [ ] RED: con el servidor local bajo throttling, verificar que la navegación dinámica actual no muestra fallback y registrar la observación en el reporte de tarea.
- [ ] GREEN: crear un skeleton accesible (`role="status"`, texto `Cargando…`) con header y seis filas, usando `animate-pulse`, `bg-muted`, `border-border` y `rounded-2xl`.
- [ ] GREEN: hacer que `app/(dashboard)/loading.tsx` retorne `<DashboardLoadingSkeleton />` sin convertirlo en Client Component.
- [ ] Verificar con `npx next build` y navegador que el shell permanece montado y el fallback aparece antes de los datos.
- [ ] Actualizar `docs/agent/architecture.md` y hacer commit `feat: add dashboard navigation fallback`.

---

### Task 3: Indicador pendiente por enlace

**Files:**
- Create: `components/layout/NavLinkPendingIndicator.tsx`
- Modify: `components/layout/DashboardNav.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `useLinkStatus` de `next/link`; el componente se renderiza dentro de cada `<Link>`.
- Produces: feedback inmediato del enlace pendiente con una demora visual de 100 ms para evitar parpadeo.

- [ ] RED: automatizar con navegador una navegación lenta y comprobar que el enlace no expone actualmente un indicador visible.
- [ ] GREEN: crear un Client Component que lea `{ pending } = useLinkStatus()` y renderice un `span aria-hidden="true"` con clase estable y atributo `data-pending`.
- [ ] GREEN: agregar animación CSS con 100 ms de delay y renderizar el indicador junto al label del enlace.
- [ ] Verificar con navegador que aparece solamente para el enlace pendiente, desaparece al completar y el activo sigue dependiendo de `usePathname()`.
- [ ] Ejecutar `npx next build` y hacer commit `feat: show pending dashboard navigation`.

---

### Task 4: Streaming granular

**Files:**
- Create: `components/layout/TableLoadingSkeleton.tsx`
- Create: `components/features/contratos/ContratosWizardData.tsx`
- Modify: `app/(dashboard)/contratos/page.tsx`
- Modify: `app/(dashboard)/gastos/page.tsx`
- Modify: `app/(dashboard)/inquilinos/page.tsx`
- Modify: `app/(dashboard)/liquidaciones/page.tsx`
- Modify: `app/(dashboard)/pagos/page.tsx`
- Modify: `app/(dashboard)/propiedades/page.tsx`
- Modify: `app/(dashboard)/propietarios/page.tsx`
- Modify: `app/(dashboard)/transacciones/page.tsx`
- Modify: `docs/agent/architecture.md`

**Interfaces:**
- Consumes: servicios actuales, `WizardContrato` y `TableCard`.
- Produces: `TableLoadingSkeleton()` y límites `Suspense` que liberan el header antes que Prisma.

- [ ] RED: bajo throttling comprobar que cada página reemplaza todo su contenido antes de resolver la tabla.
- [ ] GREEN: crear `TableLoadingSkeleton` con el tamaño visual de `TableCard` y `aria-label="Cargando datos"`.
- [ ] GREEN: envolver cada `Tabla*` en un `Suspense` con ese fallback.
- [ ] GREEN: mover la `Promise.all` de propiedades/inquilinos a `ContratosWizardData` y envolverlo en su propio `Suspense`; conservar exactamente las props actuales de `WizardContrato`.
- [ ] Verificar build, las ocho pantallas, modales y permisos; actualizar arquitectura.
- [ ] Hacer commit `perf: stream dashboard sections independently` y publicar PR 1 hacia `epic/dashboard-performance`.

---

### Task 5: Reducir payload de listados Prisma

**Files:**
- Modify: `services/contratos.service.ts`
- Modify: `services/propiedades.service.ts`
- Modify: `services/inquilinos.service.ts`
- Modify: `services/propietarios.service.ts`
- Modify: `services/pagos.service.ts`
- Modify: `services/gastos.service.ts`
- Modify: `services/liquidaciones.service.ts`
- Modify: `services/transacciones.service.ts`
- Modify: tests de servicios ya existentes que cubren esos retornos

**Interfaces:**
- Consumes: campos realmente leídos por `Tabla*`.
- Produces: el mismo contrato funcional con `select` explícito y menor serialización.

- [ ] RED: agregar assertions de forma a los tests de servicio; una mutación que quite un campo renderizado debe fallar.
- [ ] GREEN: `ContratosService.listar` conserva IDs, fechas, estado, monto, propiedad/propietario e inquilino; elimina `_count` no usado y relaciones completas.
- [ ] GREEN: `LiquidacionesService.listar` elimina `items`; `PagosService.listarRecientes` selecciona solamente fecha, monto, período, inquilino y dirección.
- [ ] GREEN: ajustar los demás listados únicamente donde exista un campo no consumido; conservar `contra_asientos` y `usuario_creador.email` en transacciones.
- [ ] Ejecutar tests afectados secuencialmente solo contra una base local descartable y `npx next build`.
- [ ] Repetir medición de payload/duración, hacer commit `perf: narrow dashboard list queries` y publicar PR 2 hacia `feat/dashboard-navigation-feedback`.

---

### Task 6: Índices Supabase respaldados por evidencia

**Files:**
- Modify: `prisma/schema.prisma` si el índice debe representarse en Prisma
- Create: migración generada por el flujo Supabase vigente de la rama épica
- Modify: `docs/agent/runbook.md` o `docs/agent/traps.md` solamente si aparece un comportamiento nuevo

**Interfaces:**
- Consumes: baseline, consultas de Task 5, `EXPLAIN (ANALYZE, BUFFERS)` y Database Advisors.
- Produces: cero o más índices medidos; cero es válido si el volumen actual no los justifica.

- [ ] Obtener planes de las consultas lentas en una base local con datos representativos.
- [ ] Evaluar como candidatos, no como obligación: `contratos(id_propiedad, estado)`, `contratos(fecha_inicio)`, `transacciones(fecha_transaccion)`, `aplicaciones_pago(id_liquidacion_item, id_cargo)` y `gastos(id_liquidacion_item, creado_en)`.
- [ ] Crear únicamente índices cuyo plan reduzca costo/scan y documentar evidencia antes/después.
- [ ] Validar migración, Prisma generate, tests afectados, Advisors y build.
- [ ] Hacer commit `perf: add measured dashboard indexes` si existe cambio; publicar PR 3 hacia `perf/dashboard-query-payload`. Si no existe cambio justificado, registrar `no-op` y omitir PR 3.

---

### Task 7: Verificación, integración de pila y PR de épica

**Files:**
- Create: `.superpowers/sdd/2026-09-12-dashboard-performance/final-results.md`
- Modify: ninguno adicional salvo correcciones del review final

**Interfaces:**
- Consumes: PRs internos, baseline y deployments Preview.
- Produces: épica integrada y un único PR `epic/dashboard-performance → develop`.

- [ ] Ejecutar tests seguros, cobertura configurada, lint y `npx next build`; documentar warnings preexistentes.
- [ ] Verificar las ocho rutas con ADMIN y al menos una con AUDITOR, incluyendo navegación, modales y logout.
- [ ] Comparar medianas y payloads contra Task 1; no aceptar regresión cálida.
- [ ] Completar review global de la pila y corregir hallazgos importantes antes de publicar.
- [ ] Integrar PRs internos en orden, actualizar `epic/dashboard-performance` y abrir un único PR de épica hacia `develop`.
