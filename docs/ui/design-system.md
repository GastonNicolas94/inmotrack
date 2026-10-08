# InmoTrack — Design System v1.0 («Cajas protagonistas»)

Versión aprobada: octubre 2026. Fuente: `InmoTrack-Design-System.md` (prototipo para Macchieraldo Villarruel). Esta implementación en `develop` migrará progresivamente la UI existente de Next.js 16; no debe confundirse la estructura `src/routes/` del prototipo con nuestro App Router.

## Principios y guardrails

1. **Las cajas mandan.** Caja 1 / `TERCEROS`: superficie carbón oscuro, texto blanco. Caja 2 / `OPERATIVA`: blanco con borde gris. No sumarlas en un saldo general.
2. **Números primero.** Moneda ARS con locale `es-AR` y números tabulares. Tipografía Sora para métricas, Manrope para interfaz.
3. **Coral con significado.** Único acento para acciones, enlaces activos y atención. Los estados se indican con texto y dot; Pagado y En término son neutros.
4. **Superficies planas.** Sin gradientes, glass, sombras decorativas, tarjetas anidadas, fuentes serif/Inter, verde de marca ni espaciado de letras negativo.
5. **Denso y legible.** 13px base; encabezado 30px desktop/24px mobile, H2 18px. Tarjetas 20–24px desktop, 16px mobile, bordes 1px, radio 8px máximo.

## Tokens oficiales

Declarados en `app/globals.css`, canónicos OKLCH:

| Token | Aproximación hexadecimal | Significado |
|---|---|---|
| `--background` | #F3F4F5 | App |
| `--foreground` / `--cash-dark` | #232527 | Texto / Caja 1 |
| `--primary` | #EF675B | Coral |
| `--brand-soft` | #F9E7E5 | Activo y atención |
| `--card` | #FFFFFF | Superficies |
| `--border` | #D8DEDF | Bordes |
| `--muted-foreground` | #7E8386 | Etiquetas |

`--shadow-soft`: reservado para diálogos y toasts. Tipografías de `next/font/google`: Sora (títulos, montos), Manrope (cuerpo). Iconografía Lucide.

## Layout y comportamiento

- >=761px: sidebar de 242px (210px para 761–1150px), topbar de 76px, contenido de hasta 1510px.
- <=760px: cabecera compacta, drawer lateral con scrim, navegación inferior fija con 5 destinos, safe-area, métricas 2x2, acciones de 48px.
- Los demás destinos permanecen accesibles desde el drawer.
- `prefers-reduced-motion` elimina animaciones. Filtros, foco y acciones deben ser operables por teclado.
- Los datos visibles vienen de servicios reales. No imprimir «Datos de ejemplo» salvo que sean ficticios.

## Separación de UI y dominio

Este documento describe diseño, **no** modifica autorizaciones ni contabilidad. Mantener roles reales ADMIN, EMPLEADO y AUDITOR (sin escritura), flujo de pagos actual y liquidaciones proporcionales. Saldos de cajas en Dashboard financiero: acumulado de `transacciones` agrupado por `caja_destino`, etiquetado **contable**: no representa conciliación bancaria ni un total disponible. Los filtros de período/cartera se aplican a los KPI de período; los saldos contables globales se etiquetan como globales.

## Composición y validación

- `components/ui` contiene Base UI/shadcn. `components/layout`: shell, navegación, encabezados y contenedores. `components/features`: módulos de dominio.
- `PageHeader`, `TableCard`, `DashboardMetricCard`, `CashBalancesCards` son patrones reutilizables.
- Comprobar: `npm run design:check`, `npm run lint`, `npm run build`, roles, flujo de registro/consulta, desktop y viewport <=760px. La automatización de diseño es un control estático, no reemplaza la comprobación visual ni los tests de integración.
