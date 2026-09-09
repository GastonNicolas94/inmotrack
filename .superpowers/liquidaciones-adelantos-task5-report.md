# Task 5 — Liquidaciones & Adelantos: Implementación Completada

## Archivos Creados

1. **`schemas/adelanto.schema.ts`**
   - Schema Zod para registrar adelantos
   - Valida que `monto` sea un número positivo

2. **`app/api/v1/propietarios/[id]/adelantos/route.ts`**
   - Ruta GET: consultar adelantos pendientes (GET abierto a cualquier rol autenticado)
   - Ruta POST: registrar un adelanto (POST ADMIN-only via middleware)
   - Serializa correctamente `Decimal` a string en las respuestas JSON
   - Implementa auth check y validación Zod

## Archivos Modificados

1. **`schemas/liquidacion.schema.ts`**
   - Extendido `generarLiquidacionSchema` con:
     - `hasta: z.coerce.date()` (fecha requerida)
     - `descontar_adelantos: z.coerce.number().min(0).default(0)` (monto opcional)

2. **`app/api/v1/liquidaciones/route.ts`**
   - Modificado handler POST para pasar `parsed.data.hasta` y `parsed.data.descontar_adelantos` a `LiquidacionesService.generarParaPropietario()`

3. **`middleware.ts`**
   - Transformado `SOLO_ADMIN` de `RegExp[]` a `{ pattern: RegExp; methods?: string[] }[]`
   - Agregada entrada para `/api/v1/propietarios/\d+/adelantos` con `methods: ["POST"]` (GET queda permitido, POST ADMIN-only)
   - Reemplazado chequeo de autorización con lógica method-aware que respeta el array `methods`
   - Mantuvo intactas las 2 entradas existentes (sin métodos específicos, ambos métodos ADMIN-only)

4. **`prisma/seed.ts`**
   - Actualizado llamado a `generarParaPropietario()` para incluir parámetro `hasta: new Date()`

## Resultado del Build

**✅ Compilación exitosa sin errores.**

El build ejecutó sin errores de TypeScript ni compilación. La nueva ruta se registró dinámicamente:
```
├ ƒ /api/v1/propietarios/[id]/adelantos
```

## Verificaciones de Integridad

- ✅ No se ejecutaron tests
- ✅ No se ejecutó `git commit`
- ✅ No se ejecutó `npm install`
- ✅ Todos los cambios respetan el patrón de autenticación y autorización existente
- ✅ La serialización de `Decimal` a string en las respuestas JSON es correcta
- ✅ El middleware implementa lógica method-aware sin romper las restricciones existentes
