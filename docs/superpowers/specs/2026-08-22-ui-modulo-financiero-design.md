# InmoTrack — UI del Módulo Financiero (Diseño)
**Fecha:** 2026-08-22
**Estado:** Aprobado (pendiente de implementación)
**Depende de:** `docs/superpowers/specs/2026-08-21-modelo-financiero-conciliacion-design.md` (modelo de datos)

---

## 1. Contexto

El modelo de datos del motor financiero (`AplicacionPago`, `Transaccion`, `Gasto`, `Liquidacion`) ya está diseñado y en implementación. Este documento define la capa de UI que lo expone: navegación, pantallas, componentes y permisos por rol. Sigue el sistema de diseño de `AGENTS.md` (tokens en `app/globals.css`, componentes compartidos en `components/layout/` y `components/features/shared/`).

Hoy el dashboard tiene 4 páginas (Contratos, Propietarios, Propiedades, Inquilinos), cada una con su tabla envuelta en `TableCard` y su `PageHeader`. Este documento agrega 4 páginas nuevas al mismo nivel.

---

## 2. Navegación y páginas

Sidebar con 8 ítems planos: `Contratos, Propietarios, Propiedades, Inquilinos, Pagos, Gastos, Liquidaciones, Libro Diario`.

| Página | Ruta | Contenido |
|---|---|---|
| Pagos | `/pagos` | Listado de pagos recientes de toda la cartera, derivado de `AplicacionPago` → `Transaccion` (`INGRESO_COBRO`) → `Contrato` → `Inquilino`/`Propiedad`. Solo lectura — el alta ocurre desde la fila del contrato. |
| Gastos | `/gastos` | Tabla única con todos los gastos (de propiedad y propios de la inmobiliaria), con badge de `CargoA`. Botón "+ Nuevo gasto" para alta directa. |
| Liquidaciones | `/liquidaciones` | Selector de propietario + botón "Generar" arriba de la tabla. Tabla con estado (`PENDIENTE`/`APROBADA`/`PAGADA`) y acciones según estado. |
| Libro Diario | `/transacciones` | Tabla completa de `Transaccion` con filtros (tipo, caja, contrato, fecha) y acción de contra-asiento. |

**Puntos de entrada duales, mismo patrón en Pagos y Gastos:**
- **Pagos:** botón "Registrar pago" en la fila del contrato (dentro de `/contratos`) + página `/pagos` de solo lectura para ver la actividad reciente de toda la cartera.
- **Gastos:** botón "Cargar gasto" en la fila del contrato, para gastos ligados a una propiedad/contrato + botón "+ Nuevo gasto" en `/gastos`, necesario además porque los gastos propios de la inmobiliaria (sin propiedad) no tienen una fila de contrato de la cual colgarse.

---

## 3. Estructura de componentes

**`components/features/pagos/`**
- `TablaPagos.tsx` — Server Component, envuelto en `TableCard`, sin acción de alta (solo lectura)
- `ModalRegistrarPago.tsx` — se invoca desde la fila del contrato

**`components/features/gastos/`**
- `TablaGastos.tsx` — envuelto en `TableCard`, botón "+ Nuevo gasto" en el `action` del `TableCard`
- `ModalCargarGasto.tsx` — toggle "De una propiedad" / "Propio de la inmobiliaria"; el segundo modo oculta el selector de propiedad/contrato y fuerza `cargo_a = INMOBILIARIA`

**`components/features/liquidaciones/`**
- `TablaLiquidaciones.tsx` — envuelto en `TableCard`, fila expandible para el detalle por `LiquidacionItem`
- `ModalGenerarLiquidacion.tsx` — selector de propietario + botón "Generar", vive en el `action` del `TableCard` de `/liquidaciones`
- `BotonesLiquidacion.tsx` — Aprobar / Confirmar pago, condicionado por `estado` y por rol (ver sección 4)

**`components/features/transacciones/`**
- `TablaLibroDiario.tsx` — envuelto en `TableCard`, con filtros por tipo/caja/contrato/fecha
- `ModalContraAsiento.tsx` — solo se renderiza si `rol === "ADMIN"`; `comentario` obligatorio en el form

**`components/features/shared/EstadoBadge.tsx`** (nuevo, genérico):

```tsx
export function EstadoBadge({
  valor,
  colores,
  formatear = (v: string) => v.replace(/_/g, " "),
}: {
  valor: string;
  colores: Record<string, string>;
  formatear?: (v: string) => string;
}) {
  return (
    <Badge className={`text-xs ${colores[valor] ?? "bg-status-neutral-bg text-status-neutral"}`}>
      {formatear(valor)}
    </Badge>
  );
}
```

Reemplaza el patrón de `Record<string,string>` + `<Badge>` repetido. Cuatro consumidores, cada uno solo aporta su diccionario de colores:
- `BadgeEstadoContrato.tsx` (refactor de lo existente, mismo diccionario `EstadoContrato` que ya tiene)
- `BadgeEstadoPeriodo.tsx` (refactor de lo existente, mismo diccionario `EstadoPeriodo` que ya tiene)
- Gastos: diccionario de `CargoA` (`INQUILINO`/`PROPIETARIO`/`INMOBILIARIA`), usado inline en `TablaGastos.tsx` — no amerita archivo propio por ser un uso único
- Liquidaciones: diccionario de `EstadoLiquidacion`, usado inline en `TablaLiquidaciones.tsx` y `BotonesLiquidacion.tsx`
- Transacciones: diccionario de `TipoTransaccion` (agrupado visualmente por caja — un rango de tonos para `TERCEROS`, otro para `OPERATIVA`), usado inline en `TablaLibroDiario.tsx`

---

## 4. Roles y permisos

| Acción | ADMIN | EMPLEADO | AUDITOR |
|---|---|---|---|
| Ver Pagos / Gastos / Liquidaciones / Libro Diario | ✓ | ✓ | ✓ (solo lectura) |
| Registrar pago | ✓ | ✓ | ✗ |
| Cargar / marcar pagado un gasto | ✓ | ✓ | ✗ |
| Generar liquidación | ✓ | ✓ | ✗ |
| Aprobar liquidación | ✓ | Solo si `Usuario.puede_aprobar_liquidaciones = true` | ✗ |
| Confirmar pago de liquidación | ✓ | ✗ | ✗ |
| Generar contra-asiento | ✓ | ✗ | ✗ |

El campo `Usuario.puede_aprobar_liquidaciones` ya existe en el modelo. Esta fase no incluye ninguna pantalla para gestionarlo (asignar/revocar la delegación) — se administra fuera de la UI hasta que se pida explícitamente.

Los botones de acción (`ModalRegistrarPago`, `ModalCargarGasto`, `ModalGenerarLiquidacion`, `BotonesLiquidacion`, `ModalContraAsiento`) se ocultan por completo para `AUDITOR` — no se muestran deshabilitados, no se renderizan.

---

## 5. Fuera de alcance de este documento

- Dashboard/reporte de balance de cajas (gráficos, agregados por rango de fechas) — pospuesto.
- Gestión de la delegación `puede_aprobar_liquidaciones` vía UI.
- Rutas API (`app/api/v1/...`) y su conexión con los servicios del backend — se resuelven en el plan de implementación.
