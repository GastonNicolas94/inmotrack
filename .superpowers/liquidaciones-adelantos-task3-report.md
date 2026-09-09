# Liquidaciones + Adelantos — Task 3 Report

## Resumen de la Reescritura

Reescribí completamente `services/liquidaciones.service.ts` según la especificación en `docs/superpowers/specs/2026-08-27-liquidaciones-adelantos-design.md`.

### Cambios principales

1. **Firma nueva de `generarParaPropietario`:**
   - Parámetros: `id_propietario: number`, `hasta: Date`, `descontarAdelantos: number | Decimal = 0`
   - `desde` se calcula internamente: `fecha_hasta` de la última liquidación + 1 día, o `1900-01-01` si no existe ninguna.

2. **Selección por rango de fechas (base caja):**
   - `AplicacionPago` filtrada por `transaccion.fecha_transaccion` en `[desde, hasta]`
   - `Gasto` filtrada por `creado_en` en `[desde, hasta]`

3. **Agrupación de LiquidacionItem:**
   - Alquiler: agrupa por `id_periodo` (un item por período tocado)
   - Gastos: agrupa por `id_propiedad` con `id_periodo = null` (siempre separado del alquiler)

4. **Lock pesimista:**
   - Sobre `AplicacionPago` (con `id_liquidacion_item IS NULL`)
   - Sobre `Gasto` (con `id_liquidacion_item IS NULL`)
   - Sobre `Transaccion` (tipo `EGRESO_ADELANTO`) si `descontarAdelantos > 0`

5. **Adelantos:**
   - Valida que el monto a descontar no supere el total pendiente (rechaza si supera)
   - Aplica por antigüedad usando `AdelantosService.obtenerPendiente()`
   - Crea un `DeduccionAdelanto` por cada adelanto tocado
   - Calcula `adelantos_descontados` y ajusta `monto_neto`

6. **Totales:**
   - `monto_bruto` = suma de `monto_bruto` de items de alquiler
   - `retenciones` = suma de comisiones + gastos
   - `monto_neto` = `monto_bruto - retenciones - adelantos_descontados`

7. **Campos de `Liquidacion`:**
   - Ahora persisten `fecha_desde`, `fecha_hasta`, `adelantos_descontados`

8. **Cambio en sellado:**
   - `AplicacionPago.id_liquidacion_item` (antes `id_liquidacion`)
   - `Gasto.id_liquidacion_item` (antes `id_liquidacion`)

### Tests Reescritos

Reescribí completamente `tests/services/liquidaciones.service.test.ts` con 8 tests principales:

1. **Pago dentro del rango:** Genera 1 LiquidacionItem con `id_periodo` seteado, comisión correcta, `monto_neto` correcto, AplicacionPago sellada.

2. **Pago fuera del rango:** No entra en la liquidación aunque no esté sellado.

3. **Pago ya sellado:** No vuelve a entrar en una segunda corrida aunque su fecha caiga en el rango.

4. **Gasto a cargo del propietario:** Genera LiquidacionItem separado con `id_periodo = null`, `gastos` correcto, `monto_neto` negativo.

5. **Pago que cubre 2 períodos:** Genera 2 LiquidacionItem (uno por período), no uno fundido.

6. **Encadenamiento:** Segunda corrida posterior no reincluye nada ya liquidado.

7. **Descuento parcial de adelantos:** Reduce `monto_neto` y genera 1 DeduccionAdelanto.

8. **Descuento que cubre 2 adelantos:** Genera 2 DeduccionAdelanto en orden de antigüedad.

También hay tests para `listar`, `aprobar`, y `confirmarPago` (estos sí tienen cambios menores debido al schema).

### Actualización a `tests/helpers/db.ts`

Agregué `deducciones_adelanto` a la lista de tablas truncadas en `cleanDatabase()`.

## Resultado de `npx next build 2>&1`

```
✓ Compiled successfully in 3.9s
  Running TypeScript ...
Failed to type check.

./app/api/v1/liquidaciones/route.ts:29:52
Type error: Expected 2-3 arguments, but got 1.

  [90m27 |[0m
  [90m28 |[0m   [36mtry[0m {
[31m[1m>[0m [90m29 |[0m     [36mconst[0m liquidacion = [36mawait[0m [33mLiquidacionesService[0m.generarParaPropietario(
  [90m   |[0m                                                    [31m[1m^[0m
  [90m30 |[0m       parsed.data.id_propietario
  [90m31 |[0m     );
  [90m32 |[0m     [36mreturn[0m [33mNextResponse.json(liquidacion, { status: [35m201[0m });
```

**Confirmación:** El error esperado en `liquidaciones.service.ts:40` (línea que decía `id_liquidacion IS NULL`) YA NO EXISTE. El único error de tipos es en `app/api/v1/liquidaciones/route.ts`, que es una tarea posterior (modificar la ruta para pasar los parámetros nuevos).

## Checklist

- [x] Reescribí `services/liquidaciones.service.ts` con firma nueva y lógica completa
- [x] Agregué todas las validaciones y locks pesimistas
- [x] Implementé manejo de adelantos con prelación por antigüedad
- [x] Reescribí completamente `tests/services/liquidaciones.service.test.ts`
- [x] Actualicé `tests/helpers/db.ts` para incluir `deducciones_adelanto`
- [x] Verifiqué tipos con `npx next build`
- [ ] NO ejecuté los tests (está prohibido)
- [ ] NO hice commit (está prohibido)
- [ ] NO ejecuté `npm install` (no fue necesario)

## Archivos Modificados

- `/Users/gfrancone/personal/InmoTrack/services/liquidaciones.service.ts` — completamente reescrito
- `/Users/gfrancone/personal/InmoTrack/tests/services/liquidaciones.service.test.ts` — completamente reescrito
- `/Users/gfrancone/personal/InmoTrack/tests/helpers/db.ts` — agregada tabla `deducciones_adelanto`
