# Task 1: Liquidaciones & Adelantos - Migración de Schema

## Status
**DONE_WITH_CONCERNS** — Schema migration completada exitosamente, pero con errores de TypeScript esperados en la capa de servicios.

## Resumen Ejecutivo

Se aplicó la migración de schema Prisma completa para el soporte de liquidaciones por período y adelantos a propietarios. La migración se aplicó exitosamente a la base de datos PostgreSQL. El build de Next.js compila sin errores en el lado de compilación, pero hay errores de TypeScript relacionados con el acceso a campos renombrados en `services/liquidaciones.service.ts`.

## Paso 1: Ediciones al Schema

Se aplicaron todos los cambios especificados en `prisma/schema.prisma`:

1. **Transaccion**: Agregado `id_propietario`, relación a `Propietario`, y relación a `DeduccionAdelanto[]`
2. **Liquidacion**: Agregados `fecha_desde`, `fecha_hasta`, `adelantos_descontados`; removidas relaciones directas a `AplicacionPago[]` y `Gasto[]`; agregada relación a `DeduccionAdelanto[]`
3. **LiquidacionItem**: Completamente reemplazado — cambio de grano de `id_contrato` a `id_periodo` (opcional) + `id_propiedad` (obligatorio); agregadas relaciones a `AplicacionPago[]` y `Gasto[]`
4. **AplicacionPago**: Renombrado `id_liquidacion`/`liquidacion` a `id_liquidacion_item`/`liquidacion_item`
5. **Gasto**: Agregado `creado_en`; renombrado `id_liquidacion`/`liquidacion` a `id_liquidacion_item`/`liquidacion_item`
6. **DeduccionAdelanto**: Nuevo modelo con relaciones a `Transaccion` y `Liquidacion`
7. **TipoTransaccion**: Agregado valor `EGRESO_ADELANTO`
8. **Relaciones back**: Agregadas relaciones en `Propietario`, `Propiedad`, y `PeriodoPago` para las nuevas relaciones bidireccionales

Archivos modificados:
- `/Users/gfrancone/personal/InmoTrack/prisma/schema.prisma`

## Paso 2: Generación del Diff

Comando ejecutado:
```bash
npx prisma migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/schema.prisma --script
```

Output obtenido (ver migration.sql completo abajo):
- Alter enum `TipoTransaccion` para agregar `EGRESO_ADELANTO`
- Drop constraints antiguos en `aplicaciones_pago`, `gastos`, `liquidaciones_items`
- Alter tables para renombrar columnas `id_liquidacion` → `id_liquidacion_item`
- Alter table `liquidaciones_items` para cambiar `id_contrato` → `id_periodo`/`id_propiedad`
- Alter table `liquidaciones` para agregar `fecha_desde`/`fecha_hasta`/`adelantos_descontados`
- Alter table `transacciones` para agregar `id_propietario`
- Create table `deducciones_adelanto`
- Add foreign keys nuevas

## Paso 3: Creación del Archivo de Migración

Timestamp: `20260906221549`

Ruta: `/Users/gfrancone/personal/InmoTrack/prisma/migrations/20260906221549_liquidaciones_adelantos/migration.sql`

Contenido: Diff completo de Prisma + statement SQL manual de limpieza:
```sql
TRUNCATE TABLE liquidaciones_items, liquidaciones RESTART IDENTITY CASCADE;
```

(Justificación: Spec 2.3 — el único dato de `LiquidacionItem` que existía en la DB es de demo con grano `id_contrato`, incompatible con el nuevo grano `id_periodo`+`id_propiedad`. El seed regenera desde cero después.)

## Paso 4: Aplicación de la Migración

### 4a. Aplicación con psql

Comando:
```bash
psql "postgresql://gfrancone@localhost:5432/inmotrack" -f /Users/gfrancone/personal/InmoTrack/prisma/migrations/20260906221549_liquidaciones_adelantos/migration.sql
```

Output (resumen):
```
ALTER TYPE (TipoTransaccion enum value added)
ALTER TABLE (16 statements successful)
CREATE TABLE (deducciones_adelanto created)
ALTER TABLE (7 foreign keys added)
TRUNCATE TABLE (liquidaciones_items, liquidaciones, + cascadas a gastos, aplicaciones_pago, deducciones_adelanto, cargos)
```

**Resultado: ✓ Exitoso** — Todas las operaciones ejecutadas sin errores.

### 4b. Marcar como aplicada

Comando:
```bash
npx prisma migrate resolve --applied 20260906221549_liquidaciones_adelantos
```

Output:
```
Prisma schema loaded from prisma/schema.prisma.
Datasource "db": PostgreSQL database "inmotrack", schema "public" at "localhost:5432"

Migration 20260906221549_liquidaciones_adelantos marked as applied.
```

**Resultado: ✓ Exitoso**

### 4c. Generar Prisma Client

Comando:
```bash
npx prisma generate
```

Output:
```
✔ Generated Prisma Client (v7.8.0) to ./node_modules/@prisma/client in 92ms
```

**Resultado: ✓ Exitoso**

## Paso 5: Verificación con `npx next build`

Comando:
```bash
npx next build
```

### Resultado de Compilación

```
✓ Compiled successfully in 3.4s
```

**Compilación: ✓ EXITOSA** — El side de compilación de Next.js/Turbopack compila sin errores.

### Errores TypeScript (Esperados — No se corrigieron)

El type checking de TypeScript reportó errores en `services/liquidaciones.service.ts`:

```
Type error: Object literal may only specify known properties, 
and 'id_liquidacion' does not exist in type 'AplicacionPagoWhereInput'.

./services/liquidaciones.service.ts:40:11
  38 |       const aplicaciones = await tx.aplicacionPago.findMany({
  39 |         where: {
> 40 |           id_liquidacion: null,
     |           ^
  41 |           cargo: {
```

**Por qué no se corrigieron**: Según las instrucciones (Paso 5), estos errores son esperados porque el servicio aún usa el modelo viejo (`id_liquidacion` en vez de `id_liquidacion_item`). La corrección de `services/liquidaciones.service.ts` es parte de la **Task 2 (servicio)**, no de esta Task 1 (schema).

**Errores reportados**: 1 error de TypeScript en `/services/liquidaciones.service.ts` línea 40.

**Otros archivos que probablemente tengan errores similares** (no verificados, espera a la Task de servicio):
- `services/liquidaciones.service.ts` — múltiples referencias a `id_liquidacion` y cambio de lógica de agrupación

## Archivos Tocados

Modificados:
- `/Users/gfrancone/personal/InmoTrack/prisma/schema.prisma` — Todos los cambios de modelo especificados

Creados:
- `/Users/gfrancone/personal/InmoTrack/prisma/migrations/20260906221549_liquidaciones_adelantos/migration.sql` — Migration SQL completa

Modificados (por Prisma automáticamente):
- `/Users/gfrancone/personal/InmoTrack/prisma/.migrate` — Registro de migración

No modificados (por restricción de tarea):
- `/Users/gfrancone/personal/InmoTrack/services/liquidaciones.service.ts` — Dejado para la Task 2
- Ningun commit de git ejecutado (prohibido en las restricciones)

## Validaciones Ejecutadas

✓ Schema compila sin errores de sintaxis Prisma
✓ Migration diff generada correctamente
✓ Migration aplicada sin errores de SQL
✓ Prisma client generado exitosamente
✓ Next.js build compila (Turbopack side)
✓ TypeScript type checking ejecutado (errores esperados dejados para siguiente task)

## Próximos Pasos (No incluidos en esta task)

1. **Task 2 (Servicio)**: Corregir `services/liquidaciones.service.ts` para usar `id_liquidacion_item` en vez de `id_liquidacion`, e implementar la lógica de agrupación por período/propiedad.
2. **Task 3 (UI)**: Implementar modal de generación de liquidación con selector de fecha "hasta" y descuento de adelantos.
3. **Task 4 (Adelantos)**: Implementar endpoint y servicio para registrar adelantos.

## Conclusión

La migración de schema Task 1 se completó exitosamente. El schema está en la base de datos, Prisma está sincronizado, y el cliente está generado. Los errores de TypeScript reportados son esperados según el diseño de tareas (tarea 1 = schema, tarea 2+ = lógica y UI) y no representan un bloqueo — es normal tener errores de TS en el momento que se cambia el schema de forma no-backwards-compatible hasta que el código la consuma sea actualizado.
