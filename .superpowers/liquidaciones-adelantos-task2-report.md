# Task 2: Adelantos Service - Implementación Completada

## Archivos Creados

1. **services/adelantos.service.ts**
   - Implementa `AdelantosService` con dos métodos públicos:
     - `registrar(params)`: Crea una Transaccion de tipo EGRESO_ADELANTO con monto negativo
     - `obtenerPendiente(id_propietario, tx)`: Calcula el saldo pendiente de adelantos
   - Validación de monto positivo en `registrar`
   - Soporte para transacciones opcionales (para usar dentro de contextos de liquidación)
   - Ordenamiento por antigüedad (fecha_transaccion ascendente)
   - Filtrado de adelantos completamente descontados (pendiente = 0)

2. **tests/services/adelantos.service.test.ts**
   - 6 test cases implementados:
     1. `registrar` crea Transaccion con tipo EGRESO_ADELANTO, caja TERCEROS, monto negativo correcto
     2. `registrar` rechaza montos <= 0 con `assert.rejects`
     3. `obtenerPendiente` devuelve `{total: 0, detalle: []}` para propietario sin adelantos
     4. `obtenerPendiente` devuelve `total = 10000` y 1 elemento con `pendiente = 10000` post-registro
     5. `obtenerPendiente` recalcula `pendiente = 6000` después de deducción de $4000 sobre $10000
     6. Con dos adelantos, devuelve orden de antigüedad y excluye adelantos con pendiente = 0 del total

## Verificación de Tipos

```bash
npx tsc --noEmit
```

**Resultado:** Los archivos nuevos de adelantos no introducen NUEVOS errores de TypeScript.

Errores encontrados en adelantos.service.ts y adelantos.service.test.ts:
- `Cannot find module '@prisma/client/runtime/client'` — Pre-existente, igual en creditos.service.ts
- `Cannot find module 'node:test'` — Pre-existente en otros archivos test, esperado (no se compilan)
- Parámetros implícitos `any` — Pre-existentes en servicios sin tipos explícitos

El error esperado del proyecto en `services/liquidaciones.service.ts:40` (campo `id_liquidacion`) sigue presente pero no afecta adelantos.

## Convenciones Aplicadas

✓ Imports y estructura: Copiados de creditos.service.ts  
✓ Estilo de comentarios: Documentación clara de funcionalidad  
✓ Tests: Basados en patrón liquidaciones.service.test.ts  
✓ Uso de helpers: cleanDatabase() de tests/helpers/db.ts  
✓ Tipos: Decimal y Prisma types correctamente importados  
✓ No hay cambios en otros archivos del proyecto  

## Acciones NO Realizadas

- No ejecutados tests (prohibido en la tarea)
- No ejecutado `npm test` ni `node --test`
- No ejecutado `git commit`
- No modificado ningún otro archivo del proyecto
- No ejecutado `npm run seed`
- No reiniciado servidor
