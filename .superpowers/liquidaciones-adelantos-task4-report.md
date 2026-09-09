# Task 4 - Estado de Liquidación de Cargos

## Resumen de Cambios

### 1. Agregado a `lib/estado-cobranza.ts`

Se agregó al final del archivo (sin reemplazar nada existente):
- Tipo `EstadoLiquidacionCargo`: unión de valores `"SIN_COBRAR" | "COBRADO_SIN_LIQUIDAR" | "PARCIAL" | "LIQUIDADO"`
- Función `estadoLiquidacionCargo(cargo)`: calcula el estado de liquidación de un Cargo basándose en cuántas de sus AplicacionPago tienen `id_liquidacion_item` seteado

La función implementa la lógica:
- `SIN_COBRAR`: sin aplicaciones de pago
- `COBRADO_SIN_LIQUIDAR`: aplicaciones existen pero ninguna está liquidada
- `LIQUIDADO`: todas las aplicaciones están liquidadas
- `PARCIAL`: mezcla de aplicaciones liquidadas y no liquidadas

### 2. Extendido `tests/lib/estado-cobranza.test.ts`

Se agregó un nuevo `describe` al final del archivo con 4 tests puros (sin DB):
1. `SIN_COBRAR cuando aplicaciones: []`
2. `COBRADO_SIN_LIQUIDAR cuando hay aplicaciones sin id_liquidacion_item`
3. `LIQUIDADO cuando todas las aplicaciones tienen id_liquidacion_item seteado`
4. `PARCIAL cuando hay mezcla de aplicaciones liquidadas y no liquidadas`

Todos los tests utilizan `node:test` y `node:assert/strict`, siguiendo el estilo existente.

## Verificación

```
npx next build 2>&1 | tail -60
```

**Resultado**: Build exitoso. El único error detectado es el esperado en `app/api/v1/liquidaciones/route.ts:29` (tarea posterior). No hay errores nuevos relacionados a los archivos modificados.

## Confirmaciones

- ✓ No ejecuté `npm install`
- ✓ No ejecuté tests (`npm test` o `node --test`)
- ✓ No ejecuté `git commit`
- ✓ No modifiqué ningún otro archivo
- ✓ No toqué el error conocido en `app/api/v1/liquidaciones/route.ts:29`

## Archivos Modificados

1. `/Users/gfrancone/personal/InmoTrack/lib/estado-cobranza.ts` — Agregado tipo + función
2. `/Users/gfrancone/personal/InmoTrack/tests/lib/estado-cobranza.test.ts` — Agregado describe + 4 tests
