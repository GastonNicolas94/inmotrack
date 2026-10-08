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

## Navegación de producto

La barra lateral y el drawer móvil llevan **InmoTrack**, nunca imágenes o marcas específicas de una inmobiliaria. Branding textual con ícono lineal Lucide (`Building2`) y acento coral sobre `--brand-soft`. Nav agrupada en `GENERAL`, `GESTIÓN`, `FINANZAS` y, solo cuando corresponda, `HERRAMIENTAS`. Links compactos, 38px de altura, íconos de 17px, activo con línea coral a la izquierda y fondo coral pálido. Evitar listas largas de links de igual jerarquía, encabezados sobredimensionados y espaciados excesivos.

Drawer móvil: ancho máximo 280px, marca en cabecera de 76px, desplazamiento exclusivo de la lista de navegación para mantener visible el pie con usuario y salida, scrim, cierre con Escape y navegación accesible mediante teclado. Sidebar escritorio de 242px y estado colapsado de 72px; las rutas reales siguen disponibles. El ítem Cobros presenta el conteo real de períodos con saldo pendiente; si la consulta falla, se omite el contador sin bloquear la navegación. Se mantiene la barra inferior de cinco accesos móvil.

## Identidad de acceso

El login presenta la **identidad de producto InmoTrack**, no la imagen ni el nombre de una inmobiliaria concreta. Usa el icono lineal `Building2` de Lucide, la marca en Sora, el coral en el isotipo/eyebrow/botón y un formulario sobre blanco con borde de 1px. Desktop: dos columnas sin tarjetas anidadas; mobile: composición apilada con formulario accesible. No se incorporan fotos, ilustraciones decorativas, gradientes, glassmorphism, estadísticas ficticias ni sombras.

El acceso realiza una sola navegación con `router.replace()`; **no** fuerza un `router.refresh()` inmediatamente después de autenticar. El login informa el progreso **desde el primer clic** ("Validando tus credenciales") con loader y anuncio accesible (`role=status`), evitando dobles envíos mediante bloqueo sincrónico. Tras autenticarse mantiene la interacción bloqueada hasta que concluye la navegación ("Acceso confirmado. Cargando tus contratos"). Un error de credenciales o red desbloquea el formulario y muestra el mensaje correspondiente. El estilo sigue siendo coral, plano y sobrio.

La autenticación y los flujos de confirmación de credenciales son independientes de este cambio visual.

## Listados, búsqueda y cobranza

`/pagos` incorpora cobranza por **período contractual**, no únicamente historial de aplicaciones: pestañas Todos, Pendientes (incluye vencidos), Vencidos y Cobrados; búsqueda por inquilino, propiedad, período o contrato; contadores y CSV con acceso autenticado. Los saldos se calculan a partir de cargos y aplicaciones (incluidos contra-asientos), con fecha de corte Argentina obtenida de `AppClock`. El modal de registro mantiene la prelación existente y expone visualmente el monto pendiente, la cobertura simulada y el saldo sobrante. El historial de cobros anterior sigue disponible al pie.

El Libro Mayor por contrato y el detalle web de liquidación (alquileres, gastos y adelantos) también se transforman en fichas móviles sin perder importes, participaciones ni trazabilidad. Las tablas de módulos de negocio usan `inmotrack-card-table`: en mobile cada fila aparece como ficha etiquetada; las acciones se preservan. `ListadoTools` aporta búsqueda libre y exportación CSV local de los datos presentes en los listados. La búsqueda se realiza sobre el conjunto cargado y **no** equivale a búsquedas paginadas o filtros en base de datos. El Libro Diario continúa siendo de solo lectura salvo contra-asientos autorizados. Los CSV escapan fórmulas para impedir ejecución accidental en Excel.

## Dashboard y composición

Las cajas siguen separadas contablemente. El Dashboard operativo agrega listas inferiores de propietarios y actividad de pagos reales, solo en desktop. En mobile las dos vistas siguen disponibles mediante selector compacto (en lugar de pestañas), respetando la funcionalidad del proyecto. El contador junto a Cobros muestra períodos con saldo pendiente. El conteo se obtiene con un Server Component dentro de Suspense: no frena el layout del dashboard ni la primera visualización de contratos. El pie identifica el producto y su versión, no datos de ejemplo.

## Separación de UI y dominio

Este documento describe diseño, **no** modifica autorizaciones ni contabilidad. Mantener roles reales ADMIN, EMPLEADO y AUDITOR (sin escritura), flujo de pagos actual y liquidaciones proporcionales. Saldos de cajas en Dashboard financiero: acumulado de `transacciones` agrupado por `caja_destino`, etiquetado **contable**: no representa conciliación bancaria ni un total disponible. Los filtros de período/cartera se aplican a los KPI de período; los saldos contables globales se etiquetan como globales.

## Composición y validación

- `components/ui` contiene Base UI/shadcn. `components/layout`: shell, navegación, encabezados y contenedores. `components/features`: módulos de dominio.
- `PageHeader`, `TableCard`, `DashboardMetricCard`, `CashBalancesCards` son patrones reutilizables.
- Comprobar: `npm run design:check`, `npm run lint:design`, `npm run lint` (este último posee seis errores heredados `react-hooks/set-state-in-effect` en modales previos a la migración), `npm run build`, roles, flujo de registro/consulta, desktop y viewport <=760px. La automatización de diseño es un control estático, no reemplaza la comprobación visual ni los tests de integración.
