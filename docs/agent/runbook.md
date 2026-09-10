---
type: Runbook
version: d2a8c04
validated: 2026-09-10
update_when: Cambian los scripts de package.json, el flujo de migraciones, o el proceso de deploy
scope:
  - package.json
  - prisma.config.ts
  - supabase/migrations
  - docs/archive/prisma-migrations
  - vercel.json
  - .github/workflows/supabase-local.yml
  - lib/seed-password.ts
---

# Runbook — InmoTrack

## Variables de entorno

| Variable | Requerida | Uso |
|----------|-----------|-----|
| `DATABASE_URL` | Sí para la app/tests DB | Conexión de runtime (pooler si el entorno remoto lo requiere). En local: `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| `DIRECT_URL` | Sí para Prisma CLI | Conexión directa usada por `prisma.config.ts`; en local puede ser la misma URL de Supabase (`127.0.0.1:54322/postgres`) |
| `INMOTRACK_ALLOW_DESTRUCTIVE_TESTS` | Sí para tests DB destructivos | Debe ser exactamente `1`; habilita el guard solamente para Supabase local canónico |
| `INMOTRACK_SEED_PASSWORD` | Sí solo al ejecutar el seed de demo | Se suministra de forma efímera y nunca se commitea; usar el mismo valor para el login de demo |
| `NEXTAUTH_SECRET` | Sí, para auth real | Firma de JWT de sesión |
| `CRON_SECRET` | Sí, para los endpoints `/api/v1/cron/*` | Comparado contra el header `Authorization: Bearer <secret>` |
| `FECHA_SIMULADA` | No — solo testing manual | Formato `YYYY-MM-DD`; override de "hoy" para `hoyEnArgentina()`. **Tira si `NODE_ENV=production`** — ver traps.md |

Se cargan desde `.env.local` / `.env` (ambos gitignoreados).

En un checkout nuevo, crea `.env.local` con esta configuración local segura:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
DATABASE_POOL_MAX=5
```

Next carga `.env.local` automáticamente para `npm run dev` y el build. Los
comandos `node`/`tsx` y `dotenv/config` no cargan `.env.local` automáticamente;
exporta las variables explícitamente en la shell antes de seed, tests y cualquier
comando Prisma:

```bash
set -a; . ./.env.local; set +a
```

## Correr localmente

```bash
npm run supabase:start
npm run db:reset:local
read -rsp "Seed password: " seed_password; echo
export INMOTRACK_SEED_PASSWORD="$seed_password"
npm run seed
unset INMOTRACK_SEED_PASSWORD seed_password
npm run dev      # next dev (Turbopack), http://localhost:3000
```

`npm run supabase:start` requiere Docker Desktop o un daemon compatible. `npx supabase
db reset` recrea el esquema desde `supabase/migrations/`; luego `npm run seed`
ejecuta `prisma/seed.ts` contra `DATABASE_URL`. No apuntar estos comandos a una
base remota.

## Seed

```bash
set -a; . ./.env.local; set +a
read -rsp "Seed password: " seed_password; echo
export INMOTRACK_SEED_PASSWORD="$seed_password"
npm run seed     # tsx prisma/seed.ts
unset INMOTRACK_SEED_PASSWORD seed_password
```

Crea 4 usuarios (`admin@inmotrack.com` / `empleado1@inmotrack.com` / `empleado2@inmotrack.com` / `auditor@inmotrack.com`, todos con el valor de `INMOTRACK_SEED_PASSWORD` usado solo durante este proceso), propietarios/propiedades/inquilinos/contratos de demo, y corre una liquidación real de punta a punta para dejar datos coherentes. Usá ese mismo valor para el login de demo. **Destructivo solo si corrés tests después** — el seed en sí no trunca nada, pero cualquier archivo de test sí (ver más abajo).

## Tests

```bash
set -a; . ./.env.local; set +a
npm test                                                      # todos (find + node --test, secuencial; el script exporta el marker)
INMOTRACK_ALLOW_DESTRUCTIVE_TESTS=1 node --import tsx --test --test-concurrency=1 tests/services/liquidaciones.service.test.ts   # un archivo puntual
node --import tsx --test tests/lib/estado-cobranza.test.ts    # tests puros (sin DB) — no hace falta --test-concurrency=1
```

**⚠️ Correr CUALQUIER archivo bajo `tests/services/` o `tests/db/` ejecuta `cleanDatabase()` en su `beforeEach`, que hace `TRUNCATE ... RESTART IDENTITY CASCADE` de TODAS las tablas de negocio contra `DATABASE_URL` — no hay una base de test separada.** Si hay datos armados a mano para explorar la app manualmente, se pierden. Preguntar antes de correr tests si eso importa; si se pierden, reconstruir con `npm run seed`.

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

## Migraciones — Supabase + Prisma diff, NUNCA `prisma migrate dev`

Supabase es la fuente de aplicación de migraciones. Prisma se usa para comparar el
schema y generar SQL; `prisma migrate dev` sigue prohibido porque puede resetear o
recrear una base sin intención.

```bash
# 1. Editar prisma/schema.prisma con el cambio deseado
set -a; . ./.env.local; set +a

# 2. Crear una migración Supabase vacía
npx supabase migration new nombre_descriptivo

# 3. Generar el diff Prisma y pegarlo en el archivo creado en supabase/migrations/
MIGRATION=$(find supabase/migrations -maxdepth 1 -name '*_nombre_descriptivo.sql' -print -quit)
test -n "$MIGRATION"
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > "$MIGRATION"
# revisar el SQL y agregar manualmente backfills seguros cuando corresponda

# 4. Validar desde cero y revisar los advisors
npx supabase db reset
npx supabase db lint
# revisar Database Advisors en el dashboard del proyecto enlazado

# 5. Verificar la app y tests contra Supabase local, y generar el cliente
npx prisma generate
npm test

# 6. Tras revisar el cambio, enlazar el proyecto y aplicarlo remotamente
npx supabase link --project-ref <project-ref>
npx supabase db push
```

`npx supabase db reset` es destructivo para la base local. Los advisors se revisan en el
dashboard (Performance/Database Advisors) para el proyecto enlazado. `npx supabase db push` requiere
revisión explícita y el proyecto remoto correcto; nunca ejecutar el push contra una
base no identificada. `supabase/migrations/` es la única historia ejecutable;
`docs/archive/prisma-migrations/` conserva la historia heredada solo como referencia.

## CI / Definition of Done

El workflow `.github/workflows/supabase-local.yml` ejecuta el gate de la fase de base de datos contra un stack Supabase local efímero en Docker. Corre en cada push a `feat/supabase-integration`, en pull requests y mediante dispatch manual. Levanta Supabase, muestra su estado, resetea las migraciones, valida y genera Prisma, ejecuta el seed, la suite de tests, el gate de cobertura y el build de Next.js; siempre intenta detener Supabase al terminar. No incluye lint porque los cinco errores existentes de lint no están relacionados con esta fase.

- [ ] `npx next build` sin errores de TypeScript
- [ ] `npm test` — decidir conscientemente si hace falta correr la suite completa (trunca la base real) o alcanza con el/los archivo(s) tocado(s)
- [ ] Si el cambio toca `prisma/schema.prisma`: migración aplicada siguiendo el flujo manual de arriba, no `migrate dev`
- [ ] Si el cambio agrega/cambia una ruta: actualizar [contracts.md](contracts.md)
- [ ] Si se descubre un gotcha no obvio: agregarlo a [traps.md](traps.md) en el mismo cambio
- [ ] Nunca `git commit`/`git push` salvo pedido explícito del usuario; nunca `git rebase` (usar `git pull` a secas para sincronizar)

## Deploy

Vercel. `vercel.json` define un único cron (`/api/v1/cron/activar-cierre-periodos`, `0 6 1 * *` — 1° de cada mes). No hay staging/preview con datos separados documentado — verificar antes de asumir que existe un entorno de pruebas remoto.
