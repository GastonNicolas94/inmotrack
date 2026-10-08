# Lecturas no bloqueantes — InmoTrack

## Criterio aprobado

**GET / SELECT:** el usuario puede navegar y ver el layout, encabezados y skeletons sin esperar a la consulta de negocio. Usar Server Components, `<Suspense>` y límites de error. Mantener un fallback accesible y concordante con «Cajas protagonistas».

**POST / PATCH / DELETE y cualquier mutación:** la acción debe esperar la confirmación real del servidor antes de indicar éxito. No introducir UI optimista, retries automáticos de mutaciones ni falsos estados de éxito.

**Seguridad:** el proxy y `requireDashboardUser` siguen verificando identidad y rol antes de presentar contenido protegido. Mostrar un skeleton no autoriza ningún dato. Los GET indispensables para autorizar una escritura pueden bloquear *esa acción*, nunca toda la navegación.

## Patrón

- Estructura inicial de la página sin llamadas de datos: `PageHeader`, filtros locales y `<Suspense fallback={<TableLoadingSkeleton/>}>`.
- El componente async hijo realiza el GET en el servidor y solo luego muestra datos.
- Las lecturas independientes se agrupan en límites `Suspense` separados y se solicitan en paralelo cuando conviene.
- `AsyncSectionSkeleton` sirve KPI y gráficos; `TableLoadingSkeleton` sirve listados responsivos.
- Los permisos y acciones de escritura continúan usando la lógica de autorización actual.
- No cachear saldos, cargos, pagos ni liquidaciones de forma indiscriminada.

## Validación antes de integrar

Comprobar que se ve el shell sin esperar datos de negocio, que los fallos de consulta no revelan datos, que el botón de escritura sigue esperando respuesta, y que filtros y detalles mantienen el resultado existente. Medir TTFB, tiempo al primer shell y tiempo al contenido cargado con herramientas de Vercel / trazas existentes; no afirmar mejoras de milisegundos sin medición.

## Cobertura actual

| Vista | GET no bloqueante | Componente |
|---|---|---|
| Dashboard | Filtros, cajas y KPI independientes | `DashboardFilterOptions`, `FinancialCashBalances`, `DashboardMetrics` |
| Contratos | Tabla y opciones de alta separadas | `TablaContratos`, `ContratosWizardData` |
| Propiedades | Tabla | `TablaPropiedades` |
| Propietarios | Tabla | `TablaPropietarios` |
| Inquilinos | Tabla | `TablaInquilinos` |
| Cobros | Deuda y últimos pagos independientes | `CobranzasListado`, `TablaPagos` |
| Gastos | Tabla | `TablaGastos` |
| Liquidaciones | Tabla + detalle consultado aparte | `TablaLiquidaciones`, `LiquidacionDetalleContenido` |
| Libro Diario | Tabla | `TablaLibroDiario` |
| Libro Mayor contrato | Detalle consultado aparte | `MovimientosContratoContenido` |

`npm run async:check` valida la presencia de los boundaries y los gates; la suite integral permanece en GitHub Actions.

## Resultados esperados y límites

- Se debe ver una estructura estable y un skeleton aun cuando un GET sea lento. No se afirma reducción del tiempo de ejecución del GET.
- Autorización, validación de sesión, búsqueda del perfil y validaciones antes de mutaciones **sí pueden bloquear el acceso a datos protegidos**. Esto es intencional.
- Las acciones con escritura no son optimistas. El botón y su confirmación quedan sujetos a la respuesta real del servidor.
- El fallback visual se prueba con throttling en desktop/mobile; el comportamiento ante error y permisos se prueba con datos de prueba, sin modificar producción.
