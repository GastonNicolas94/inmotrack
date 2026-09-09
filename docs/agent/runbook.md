---
type: Runbook
version: 37d97fb6e
validated: 2026-09-09
update_when: Cambian los scripts de package.json, el flujo de migraciones, o el proceso de deploy
scope:
  - package.json
  - prisma.config.ts
  - prisma/migrations
  - vercel.json
---

# Runbook — InmoTrack

## Variables de entorno

| Variable | Requerida | Uso |
|----------|-----------|-----|
| `DATABASE_URL` | No (tiene fallback local) | Conexión Postgres. Sin ella, cae a `postgresql://gfrancone@localhost:5432/inmotrack` — ver traps.md |
| `NEXTAUTH_SECRET` | Sí, para auth real | Firma de JWT de sesión |
| `CRON_SECRET` | Sí, para los endpoints `/api/v1/cron/*` | Comparado contra el header `Authorization: Bearer <secret>` |
| `FECHA_SIMULADA` | No — solo testing manual | Formato `YYYY-MM-DD`; override de "hoy" para `hoyEnArgentina()`. **Tira si `NODE_ENV=production`** — ver traps.md |

Se cargan desde `.env.local` / `.env` (ambos gitignoreados).

## Correr localmente

```bash
npm run dev      # next dev (Turbopack), http://localhost:3000
```

## Seed

```bash
npm run seed     # tsx prisma/seed.ts
```

Crea 4 usuarios (`admin@inmotrack.com` / `empleado1@inmotrack.com` / `empleado2@inmotrack.com` / `auditor@inmotrack.com`, password `admin123` para todos), propietarios/propiedades/inquilinos/contratos de demo, y corre una liquidación real de punta a punta para dejar datos coherentes. **Destructivo solo si corrés tests después** — el seed en sí no trunca nada, pero cualquier archivo de test sí (ver más abajo).

## Tests

```bash
npm test                                                      # todos (find + node --test, secuencial)
node --import tsx --test --test-concurrency=1 tests/services/liquidaciones.service.test.ts   # un archivo puntual
node --import tsx --test tests/lib/estado-cobranza.test.ts    # tests puros (sin DB) — no hace falta --test-concurrency=1
```

**⚠️ Correr CUALQUIER archivo bajo `tests/services/` o `tests/db/` ejecuta `cleanDatabase()` en su `beforeEach`, que hace `TRUNCATE ... RESTART IDENTITY CASCADE` de TODAS las tablas de negocio contra la base real configurada (`DATABASE_URL`/fallback local) — no hay una base de test separada.** Si hay datos armados a mano para explorar la app manualmente, se pierden. Preguntar antes de correr tests si eso importa; si se pierden, reconstruir con `npm run seed`.

`--test-concurrency=1` es obligatorio para los tests de `services/`: corren contra la MISMA base real, y varios usan `FECHA_SIMULADA`/locks pesimistas — correrlos en paralelo produce carreras falsas que no existen en producción.

Los tests de `tests/lib/` que no importan `tests/helpers/db.ts` son funciones puras sin I/O — se pueden correr en paralelo o sueltos sin este cuidado.

## Build

```bash
npx next build
```

El type-check REAL del proyecto pasa por acá (el paso "Running TypeScript" del build), no por `npx tsc --noEmit` suelto — ver traps.md, esa invocación da falsos negativos masivos en este repo por resolución de paths rota.

## Lint

```bash
npm run lint      # eslint
```

## Migraciones — flujo manual, NUNCA `prisma migrate dev`

Este repo no usa el flujo automático de Prisma (`migrate dev` asume que puede resetear/re-crear libremente, y acá hay datos reales de desarrollo que no se quieren perder). El flujo real:

```bash
# 1. Editar prisma/schema.prisma con el cambio deseado

# 2. Generar el diff (no aplica nada todavía)
npx prisma migrate diff --from-config-datasource prisma.config.ts \
  --to-schema prisma/schema.prisma --script

# 3. Crear la carpeta de migración a mano y pegar el diff generado
mkdir -p prisma/migrations/$(date +%Y%m%d%H%M%S)_nombre_descriptivo
# escribir el .sql ahí — agregar a mano cualquier TRUNCATE/backfill necesario,
# DESPUÉS de los ALTER TABLE que agregan columnas NOT NULL sin default si la
# tabla puede tener filas (si el TRUNCATE queda antes, el ALTER falla en una
# base con datos — ver traps.md)

# 4. Aplicar directo con psql
psql "$DATABASE_URL" -f prisma/migrations/<carpeta>/migration.sql

# 5. Marcarla como aplicada ante Prisma (sin re-ejecutarla)
npx prisma migrate resolve --applied <carpeta>

# 6. Regenerar el cliente
npx prisma generate
```

Ver `prisma/migrations/20260906221549_liquidaciones_adelantos/migration.sql` como ejemplo real de este flujo, incluyendo un `TRUNCATE` manual agregado al final por un cambio de grano incompatible con los datos existentes.

## CI / Definition of Done

**No hay CI configurada** — este es un repo personal de un solo desarrollador, sin pipeline de PR ni gates automáticos. La verificación es manual, en este orden, antes de considerar un cambio terminado:

- [ ] `npx next build` sin errores de TypeScript
- [ ] `npm test` — decidir conscientemente si hace falta correr la suite completa (trunca la base real) o alcanza con el/los archivo(s) tocado(s)
- [ ] Si el cambio toca `prisma/schema.prisma`: migración aplicada siguiendo el flujo manual de arriba, no `migrate dev`
- [ ] Si el cambio agrega/cambia una ruta: actualizar [contracts.md](contracts.md)
- [ ] Si se descubre un gotcha no obvio: agregarlo a [traps.md](traps.md) en el mismo cambio
- [ ] Nunca `git commit`/`git push` salvo pedido explícito del usuario; nunca `git rebase` (usar `git pull` a secas para sincronizar)

## Deploy

Vercel. `vercel.json` define un único cron (`/api/v1/cron/activar-cierre-periodos`, `0 6 1 * *` — 1° de cada mes). No hay staging/preview con datos separados documentado — verificar antes de asumir que existe un entorno de pruebas remoto.
