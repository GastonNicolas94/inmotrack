<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cómo usar este repo (agentes)

Antes de tocar código, leer en este orden — es el contexto de agente mantenido de este repo, más rápido y más confiable que re-derivar todo leyendo el código de cero:

1. `docs/agent/overview.md` — qué hace el sistema, roles, mapa de capacidades → código
2. `docs/agent/architecture.md` — capas, layout de carpetas, flujo de request, patrón outbox
3. `docs/agent/contracts.md` — rutas HTTP, acceso por rol, recursos de plataforma
4. `docs/agent/runbook.md` — comandos de dev/test/build/migraciones, Definition of Done
5. `docs/agent/traps.md` — gotchas no obvios ya encontrados — leer antes de asumir que algo raro es un bug nuevo
6. `docs/agent/observability.md` — request correlation, logging estructurado, thresholds, eventos de dominio y diagnóstico DB

**Regla de mantenimiento:** quien cambie código (humano o agente) actualiza la guía de `docs/agent/` correspondiente en el mismo cambio — bump de `version` (SHA corto de HEAD) y `validated` (fecha) en el frontmatter — y agrega una entrada a `traps.md` si descubre un comportamiento no obvio. No hay gate de CI que lo fuerce (este repo no tiene CI) — es disciplina manual.

## Sistema de diseño oficial — InmoTrack, «Cajas protagonistas» (oct 2026)

**Fuente de verdad:** `docs/ui/design-system.md` y el documento `InmoTrack-Design-System.md` aprobado. Este estándar REEMPLAZA el rediseño estilo apple.com de agosto 2026.

- **Tokens** en `app/globals.css`. Colores canónicos OKLCH; fondo humo, texto carbón, coral para acciones y alertas, superficies blancas y bordes gris frío. Prohibido hardcodear colores de marca, usar gradientes, glassmorphism o sombras decorativas.
- **Fuentes:** Sora para títulos, marca y cifras; Manrope para cuerpo y controles. Prohibidos Inter, serif y letter-spacing negativo.
- **Espaciado y forma:** grilla 4px, tarjetas/controles con radios máximos de 8px; avatares y dots circulares. Nada de tarjetas dentro de tarjetas.
- **Cajas:** Caja 1 (TERCEROS) oscura, Caja 2 (OPERATIVA) clara. No se fusionan, ni se exhibe saldo total sumado. Métricas reales de la base, nunca valores ficticios.
- **Montos:** `Intl.NumberFormat("es-AR", {style:"currency", currency:"ARS"})` y `tabular-nums`; usar Sora para cifras.
- **Responsivo:** sidebar escritorio, drawer mobile con scrim, bottom navigation de 5 accesos en <=760px. Preservar destinos existentes aunque excedan los 8 del prototipo.
- **Estados:** `bg-status-{success,warning,danger,neutral}-bg` y `text-status-...`, con texto + dot; jamás comunicar solamente con color. El coral es acción o atención; estados pagados/en término son neutros.
- **Accesibilidad:** focus visible, labels, teclado y `prefers-reduced-motion`. No introducir rótulos «Datos de ejemplo» salvo datos efectivamente ficticios.
- **Negocio:** no modificar autorización ni contabilidad por copiar el prototipo; conservar liquidaciones individuales, roles actuales, el Libro Diario inmutable y filtros.

**Componentes compartidos:** `components/ui` para primitivos, `components/layout` para shell/encabezados/tablas y `components/features/<dominio>` para UI propia. Reutilizar `PageHeader`, `TableCard`, `BadgeEstadoPeriodo` y `PeriodoResumenRow`. No clonar componentes por pantalla.

Los cambios de frontend deben revisar tanto desktop como mobile y ejecutar `npm run design:check` y `npm run lint:design` además del lint integral (baseline con seis errores heredados en modales no modificados) y los tests pertinentes.

## GET no bloqueantes (oct 2026)

Consultar `docs/ui/async-reads.md`. Navegación rápida con shell autenticado y `Suspense` independiente por sección GET; skeletons `TableLoadingSkeleton` / `AsyncSectionSkeleton`; proteger con `requireDashboardUser`. No bloquear páginas por queries auxiliares (KPIs, menús, tablas). POST/PATCH/DELETE conservan confirmación real y no actualizaciones optimistas. Validación rápida `npm run async:check` antes de CI de integración; no confundir carga asíncrona con consultas más rápidas.
