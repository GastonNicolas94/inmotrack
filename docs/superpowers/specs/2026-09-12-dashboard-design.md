# Dashboard operativo y financiero

## Estado

Diseño aprobado para revisión de especificación. Esta especificación precede a la implementación y no modifica todavía el modelo ni la interfaz.

## Objetivo

Convertir la ruta `/` de InmoTrack en un dashboard útil para la operación diaria de la inmobiliaria y para la lectura financiera del negocio.

El dashboard tendrá dos solapas:

1. **Operativo**: qué requiere atención hoy.
2. **Financiero**: qué dinero se administró y cuál fue el resultado de la inmobiliaria en un período.

La primera versión será un snapshot server-side al cargar o cambiar filtros. No incorporará Supabase Realtime, polling ni una capa analítica separada.

## Contexto actual

- La ruta `/` actualmente redirige a `/contratos`.
- Ya existen las entidades y servicios de contratos, períodos, cargos, pagos, gastos, liquidaciones y transacciones.
- La aplicación distingue caja de terceros y caja operativa mediante `Transaccion.caja_destino`.
- Las operaciones contables se registran con transacciones firmadas y los contra-asientos revierten movimientos anteriores.
- La aplicación usa `hoyEnArgentina`, `mesEnArgentina` y convenciones explícitas para evitar errores de zona horaria.
- El frontend usa Next.js App Router y componentes server-side; no existe actualmente una librería de gráficos.

## Alcance

### Incluido

- Página principal de dashboard en `/`.
- Solapa Operativo.
- Solapa Financiero.
- Filtros compartidos persistidos en la URL.
- Agregaciones server-side mediante un servicio específico.
- Tarjetas KPI, alertas, acciones rápidas y gráficos livianos.
- Estados de loading, vacío y error por sección.
- Tests de la lógica nueva con cobertura del 100% de statements, branches, functions y lines en el alcance incorporado o modificado.

### Fuera de alcance

- Supabase Realtime, notificaciones push o polling.
- Cambios al motor de pagos, punitorios, créditos o liquidaciones.
- Cambios al modelo contable para agregar atribución por propiedad.
- Cálculo de ROI o rentabilidad sobre el valor de compra de un inmueble.
- Vistas materializadas, data warehouse o una capa de BI.
- Paginación general de los módulos existentes.
- Creación de índices sin evidencia de `EXPLAIN` o una necesidad medida.

## Experiencia de usuario

### URL y filtros

La pantalla se controla con estos parámetros:

| Parámetro | Valores | Default |
| --- | --- | --- |
| `tab` | `operativo`, `financiero` | `operativo` |
| `periodo` | `YYYY-MM` | mes actual en Argentina |
| `propiedad` | `todos` o un ID positivo | `todos` |
| `cartera` | `todas`, `propias`, `terceros` | `todas` |

Los filtros deben validarse con Zod. Valores inválidos vuelven al default seguro y no generan una consulta arbitraria.

La barra de filtros es compartida por ambas solapas. Al cambiar de solapa se conservan `periodo`, `propiedad` y `cartera`. Las solapas son enlaces navegables, por lo que el estado se puede compartir y recuperar sin depender de estado local del navegador.

### Semántica del período

- Las métricas financieras usan `fecha_transaccion` dentro del intervalo semiabierto `[inicioDelMes, inicioDelMesSiguiente)` en hora de Argentina.
- Las métricas de estado operativo se calculan respecto de hoy en Argentina.
- La solapa Operativo representa el estado actual: sus alertas y pendientes no desaparecen al seleccionar otro mes. El período seleccionado se usa para las métricas financieras y sus series históricas.
- Los campos PostgreSQL `@db.Date` se leen con las utilidades existentes basadas en UTC; no se deben usar getters locales directamente.

### Solapa Operativo

#### KPI

1. **Contratos vigentes**: contratos en estado `ACTIVO`, `MOROSO` o `POR_VENCER`.
2. **Contratos por vencer**: contratos vigentes cuya `fecha_fin` cae entre hoy y los próximos 30 días.
3. **Cuotas vencidas**: períodos con vencimiento anterior a hoy y saldo pendiente positivo.
4. **Monto vencido**: suma de los saldos pendientes de esas cuotas.
5. **Gastos pendientes**: gastos a cargo de propietario o inmobiliaria con `estado_pago = PENDIENTE`; no mezcla cargos del inquilino con pagos a proveedores.
6. **Liquidaciones pendientes**: liquidaciones en estado `PENDIENTE` o `APROBADA`, junto con su monto neto pendiente.

El saldo pendiente de un cargo se calcula a partir de `Cargo.monto` y sus `AplicacionPago`, incluyendo correctamente aplicaciones negativas generadas por contra-asientos. No se infiere la deuda únicamente por el estado del contrato.

#### Alertas

La pantalla muestra listas acotadas y ordenadas por urgencia:

- Contratos por vencer.
- Inquilinos con deuda vencida.
- Gastos pendientes de pago.
- Liquidaciones pendientes de aprobación o pago.

Cada fila enlaza al módulo que permite resolverla. Las consultas de alertas tienen un límite explícito para no convertir el dashboard en un listado sin paginar.

#### Acciones rápidas

- Nuevo contrato.
- Registrar pago.
- Cargar gasto.
- Generar liquidación.

Las acciones respetan los permisos existentes. El dashboard no agrega permisos nuevos ni ejecuta operaciones contables directamente.

### Solapa Financiero

#### KPI

1. **Cobrado**: suma firmada de `INGRESO_COBRO` y sus contra-asientos dentro del período.
2. **Ingresos de la inmobiliaria**: suma firmada de `INGRESO_COMISION`, `INGRESO_PUNITORIO`, `INGRESO_ALQUILER_PROPIO` e `INGRESO_CONFECCION_CONTRATO`, incluyendo sus contra-asientos.
3. **Gastos operativos pagados**: suma firmada de `EGRESO_OPERATIVO` y sus contra-asientos, presentada como egreso positivo en la interfaz.
4. **Resultado operativo**: ingresos de la inmobiliaria más gastos operativos firmados.
5. **Pendiente de liquidar**: suma de `Liquidacion.monto_neto` en estados `PENDIENTE` y `APROBADA`.
6. **Deuda vencida**: mismo concepto de deuda vencida de la solapa Operativo, aplicado a los filtros seleccionados.

Los flujos de terceros (`EGRESO_LIQUIDACION`, `EGRESO_TERCEROS` y `EGRESO_ADELANTO`) se muestran separados cuando corresponda, pero no se mezclan con el resultado operativo de la inmobiliaria.

#### Gráficos y desglose

- **Ingresos vs. egresos operativos**: serie de seis meses terminando en el período seleccionado.
- **Cobros por cartera**: cobranza bruta de inmuebles propios frente a inmuebles de terceros.
- **Cobros por propiedad**: ranking o barras de cobros atribuibles explícitamente a una propiedad mediante contrato.
- **Gastos registrados por categoría**: distribución de gastos a cargo de la inmobiliaria (`cargo_a = INMOBILIARIA`) por `TipoGasto`, usando `Gasto.creado_en`. Se etiqueta como gastos registrados, no como flujo de caja, porque el modelo actual no vincula cada `EGRESO_OPERATIVO` con su categoría ni con la fecha de pago.

La primera versión no muestra “resultado neto por propiedad”. `Transaccion` no tiene una relación directa con `Propiedad`, `Gasto` o `Liquidacion`; en consecuencia, algunos movimientos de propiedades sin contrato y algunos pagos de liquidación no pueden atribuirse sin inferencias. El dashboard debe preferir omitir un dato no atribuible antes que mostrar un resultado incorrecto.

Cuando se aplica un filtro de propiedad o cartera, sólo se incluyen registros con atribución explícita. La interfaz muestra una nota indicando que los movimientos sin inmueble asociado quedan fuera de una vista filtrada.

### Estados visuales

- `loading`: skeleton de tarjetas y bloques.
- `empty`: mensaje claro cuando no hay datos en el período o filtro.
- `error`: fallback aislado por bloque; un error de un gráfico no debe ocultar las tarjetas o alertas que sí pudieron calcularse.
- `updated`: hora de generación del snapshot, en horario de Argentina.
- Los gráficos deben tener una representación tabular o textual accesible debajo o como alternativa para lectores de pantalla y validación manual.

## Arquitectura

### Flujo de datos

```text
searchParams
    ↓
parseDashboardFilters()
    ↓
requireDashboardUser()
    ↓
DashboardService
    ↓
DTOs agregados y tipados
    ↓
KPI cards, alertas, tablas y gráficos
```

### Límites de módulos

- `lib/dashboard/filters.ts`: tipos, defaults, validación y rangos temporales.
- `lib/dashboard/metrics.ts`: funciones puras para fórmulas, signos, agrupaciones y formateo de view models.
- `services/dashboard.service.ts`: acceso a Prisma y composición de consultas agregadas.
- `components/features/dashboard/`: componentes visuales server-side y gráficos SVG/CSS.
- `app/(dashboard)/page.tsx`: composición de la página y selección de solapa.

El servicio debe poder recibir dependencias inyectadas en tests, siguiendo el patrón de los servicios existentes. No se deben devolver modelos Prisma crudos a los componentes; cada sección expone un DTO estable.

### Consultas y performance

- Ejecutar consultas independientes en paralelo cuando no exista dependencia entre ellas.
- Usar `select`, `count`, `aggregate`, `groupBy` o SQL parametrizado tipado sólo cuando Prisma no exprese la agregación necesaria.
- No cargar toda la cartera para contar o sumar en memoria.
- Limitar las listas de alertas.
- Evitar N+1 para propiedades, contratos, gastos y liquidaciones.
- Mantener los gráficos livianos mediante SVG/CSS en la primera versión, sin agregar una dependencia de charts.
- No agregar caché ni Realtime; el snapshot debe ser consistente con la lectura server-side.

### Seguridad y autorización

- La página requiere el usuario autenticado mediante `requireDashboardUser`.
- Las consultas se ejecutan únicamente en el servidor con Prisma.
- No se exponen claves de Supabase ni se usa el Data API desde el dashboard.
- Los importes se muestran sólo a usuarios que ya tienen acceso al dashboard financiero según las reglas actuales de la aplicación.
- Los datos de terceros y los ingresos operativos se presentan separados para evitar confusión contable.

## Pruebas

### Unitarias

- Parseo y defaults de filtros.
- Rechazo de meses, IDs y carteras inválidos.
- Cálculo de límites de período en zona horaria de Argentina.
- Contratos vigentes y por vencer.
- Saldo pendiente de cargos con aplicaciones parciales, sobrantes y contra-asientos.
- Gastos y liquidaciones pendientes.
- Clasificación de transacciones por caja y tipo.
- Resultado operativo sin doble conteo del cobro bruto y la comisión.
- Contra-asientos que revierten ingresos o egresos.
- Exclusión explícita de movimientos no atribuibles al filtrar por propiedad.
- Series de seis meses y datasets vacíos.

### Integración

- Servicio del dashboard contra la base local con fixtures representativos de propios, terceros, deuda, gastos, cobros, liquidaciones y reversas.
- Verificación de que los filtros no amplíen el conjunto consultado.
- Verificación de que ninguna métrica financiera mezcle caja de terceros con resultado operativo.

### Verificación manual de Preview

El usuario validará visualmente en Vercel Preview:

1. `/` abre el dashboard y no redirige a `/contratos`.
2. Las dos solapas mantienen los filtros.
3. Cambiar mes actualiza los bloques financieros; cambiar cartera e inmueble actualiza ambos conjuntos de bloques sin ocultar alertas operativas actuales.
4. Los enlaces de alertas y acciones rápidas llevan a destinos correctos.
5. Los estados vacío, loading y error son comprensibles.
6. Los importes coinciden con `/pagos`, `/gastos`, `/liquidaciones` y `/transacciones` para un dataset conocido.

La cobertura automatizada de la lógica incorporada o modificada debe quedar en 100% de statements, branches, functions y lines dentro de los grupos configurados en `npm run test:coverage`.

## Criterios de aceptación

- La ruta `/` muestra el dashboard autenticado.
- Existen exactamente las solapas Operativo y Financiero.
- Los filtros son compartidos, validados y persistidos en la URL.
- Las métricas operativas coinciden con los servicios de dominio existentes.
- Las métricas financieras respetan signos, cajas y contra-asientos.
- No se muestran resultados por propiedad cuando la atribución no está respaldada por el modelo.
- El dashboard funciona sin Realtime y sin consultas periódicas.
- Una falla parcial no deja la página en blanco.
- Las pruebas nuevas alcanzan el 100% de cobertura exigido.
- El build de Next.js y el check de Vercel son exitosos.

## Orden de implementación previsto

La implementación se realizará después de aprobar esta especificación, en PRs apilados:

1. Contrato de filtros, DTOs, fórmulas y servicio de agregación.
2. Solapa Operativo y alertas.
3. Solapa Financiero y gráficos.
4. Integración de `/`, navegación, filtros y estados visuales.
5. PR final de la épica hacia `develop`.

La fase posterior de atribución contable por propiedad podrá agregar relaciones explícitas entre transacciones, gastos, liquidaciones y propiedades; no forma parte de este dashboard MVP.
