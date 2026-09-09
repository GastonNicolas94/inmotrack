# Task 6 Report - Liquidaciones y Adelantos

## Resumen de Cambios

Completadas las 3 tareas finales de la serie sin errores.

### Archivos Creados
- `/Users/gfrancone/personal/InmoTrack/components/features/propietarios/ModalRegistrarAdelanto.tsx` (nuevamente creado)

### Archivos Modificados
- `/Users/gfrancone/personal/InmoTrack/components/features/propietarios/TablaPropietarios.tsx`
  - Agregada importación de `ModalRegistrarAdelanto`
  - Agregada columna vacía en `TableHeader` (acción)
  - Cambiado `colSpan` de 3 a 4 en el mensaje "No hay propietarios cargados"
  - Agregada celda con `ModalRegistrarAdelanto` en cada fila de propietario

- `/Users/gfrancone/personal/InmoTrack/components/features/liquidaciones/ModalGenerarLiquidacion.tsx`
  - Completamente reemplazado con nueva versión que incluye:
    - Estado `hasta` (date) con valor inicial como hoy
    - Estado `adelantoPendiente` que se carga vía `useEffect` desde `/api/v1/propietarios/{id}/adelantos`
    - Estado `descontarAdelantos` (string, evitando bug de NaN)
    - Campo Input con date type para "Hasta"
    - Campo Input con number type para "Descontar de adelantos" (solo visible si hay adelantos pendientes)
    - POST a `/api/v1/liquidaciones` con payload `{ id_propietario, hasta, descontar_adelantos }`

## Verificación

Build ejecutado exitosamente:
```
npx next build 2>&1 | tail -60
```

Resultado: **SIN ERRORES DE TYPESCRIPT** — todos los archivos compilan correctamente. El build finalizó exitosamente con 25/25 páginas estáticas generadas.

### Confirmaciones
- ✓ NO se ejecutó `git commit`
- ✓ NO se ejecutó `npm install`
- ✓ NO se ejecutaron tests
- ✓ Patrón de string en input numérico seguido correctamente (evita bug NaN)
- ✓ Patrones de componentes existentes reutilizados sin cambios al sistema de diseño
- ✓ Build sin errores TypeScript
