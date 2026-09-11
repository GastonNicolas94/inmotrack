---
type: Runbook
version: 2c63145
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
  - lib/supabase
  - app/auth/confirm
---

# Runbook — InmoTrack

## Variables de entorno

| Variable | Requerida | Uso |
|----------|-----------|-----|
| `DATABASE_URL` | Sí para la app/tests DB | Conexión de runtime (pooler si el entorno remoto lo requiere). En local: `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| `DIRECT_URL` | Sí para Prisma CLI | Conexión directa usada por `prisma.config.ts`; en local puede ser la misma URL de Supabase (`127.0.0.1:54322/postgres`) |
| `INMOTRACK_ALLOW_DESTRUCTIVE_TESTS` | Sí para tests DB destructivos | Debe ser exactamente `1`; habilita el guard solamente para Supabase local canónico |
| `INMOTRACK_SEED_PASSWORD` | Sí solo al ejecutar el seed de demo | Se suministra de forma efímera y nunca se commitea; usar el mismo valor para el login de demo |
| `CRON_SECRET` | Sí, para los endpoints `/api/v1/cron/*` | Comparado contra el header `Authorization: Bearer <secret>` |
| `APP_URL` | Sí para invitar usuarios y `npm run bootstrap:admin` | Origen HTTP/HTTPS sin credenciales, path, query ni hash; las invitaciones usan `${APP_URL}/auth/confirm` |
| `NEXT_PUBLIC_SUPABASE_URL` | Sí, para clientes Supabase | URL pública del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Sí, para clientes Supabase | Publishable key segura para navegador y servidor |
| `SUPABASE_SECRET_KEY` | Sí, solo servidor | Secret key privilegiada; nunca exponerla a módulos cliente |
| `BOOTSTRAP_ADMIN_EMAIL` | Sí para `npm run bootstrap:admin` | Email que recibirá la invitación del primer ADMIN |
| `BOOTSTRAP_ADMIN_CONFIRM_ENV` | Sí para `npm run bootstrap:admin` | Confirmación explícita: debe ser exactamente `production`, `development` o `test` según `NODE_ENV`; evita destinos ambiguos |
| `BOOTSTRAP_ADMIN_CONFIRM_SUPABASE_URL` | Sí para `npm run bootstrap:admin` | Debe coincidir exactamente (normalizada, sin path/query/credenciales) con `NEXT_PUBLIC_SUPABASE_URL` |
| `FECHA_SIMULADA` | No — solo testing manual | Formato `YYYY-MM-DD`; override de "hoy" para `hoyEnArgentina()`. **Tira si `NODE_ENV=production`** — ver traps.md |

Supabase Auth es propietario de credenciales y sesiones; `public.usuarios` conserva únicamente
el perfil, el rol, el permiso de aprobación y `auth_user_id`. No agregar `password_hash` ni
autorizar usando `user_metadata`. El `proxy.ts` refresca cookies y los handlers consultan
`lib/auth-context.ts` para autorización server-side.

Se cargan desde `.env.local` / `.env` (ambos gitignoreados).

El proyecto requiere Node.js 22 o superior, igual que `@supabase/supabase-js`.

En un checkout nuevo, crea `.env.local` con esta configuración local segura:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
DATABASE_POOL_MAX=5
APP_URL=http://127.0.0.1:3000
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=local-publishable-key
SUPABASE_SECRET_KEY=local-secret-key
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
export INMOTRACK_ALLOW_DESTRUCTIVE_TESTS=1  # habilita el guard local para limpiar Auth demo
npm run seed
unset INMOTRACK_SEED_PASSWORD INMOTRACK_ALLOW_DESTRUCTIVE_TESTS seed_password
npm run dev      # next dev (Turbopack), http://localhost:3000
```

`npm run supabase:start` requiere Docker Desktop o un daemon compatible. `npx supabase
db reset` recrea el esquema desde `supabase/migrations/`; luego `npm run seed`
ejecuta `prisma/seed.ts` contra `DATABASE_URL`. No apuntar estos comandos a una
base remota.

## Bootstrap del primer administrador

El bootstrap no usa passwords demo: Supabase envía una invitación para que el
administrador establezca su contraseña. Antes de ejecutarlo, confirmá el destino
de forma explícita (`BOOTSTRAP_ADMIN_CONFIRM_ENV=development` o
`BOOTSTRAP_ADMIN_CONFIRM_ENV=production`, coincidente con `NODE_ENV`) y definí
`BOOTSTRAP_ADMIN_EMAIL`. En producción el script rechaza
`INMOTRACK_SEED_PASSWORD` y `BOOTSTRAP_ADMIN_PASSWORD`; esas variables solo
pertenecen al seed local. Si falla la creación del perfil Prisma, elimina la
identidad Auth invitada como compensación.

```bash
export BOOTSTRAP_ADMIN_EMAIL=admin@tu-dominio.example
export NODE_ENV=production
export BOOTSTRAP_ADMIN_CONFIRM_ENV=production
export BOOTSTRAP_ADMIN_CONFIRM_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL"
export APP_URL=https://app.tu-dominio.example
npm run bootstrap:admin
```

## Seed

```bash
set -a; . ./.env.local; set +a
read -rsp "Seed password: " seed_password; echo
export INMOTRACK_SEED_PASSWORD="$seed_password"
export INMOTRACK_ALLOW_DESTRUCTIVE_TESTS=1  # el seed solo acepta Supabase local explícito
npm run seed     # tsx prisma/seed.ts
unset INMOTRACK_SEED_PASSWORD INMOTRACK_ALLOW_DESTRUCTIVE_TESTS seed_password
```

Crea 4 identidades Auth (`admin@inmotrack.com` / `empleado1@inmotrack.com` / `empleado2@inmotrack.com` / `auditor@inmotrack.com`, todas con el valor de `INMOTRACK_SEED_PASSWORD` usado solo durante este proceso) y sus perfiles de dominio, propietarios/propiedades/inquilinos/contratos de demo, y corre una liquidación real de punta a punta para dejar datos coherentes. Usá ese mismo valor para el login de demo. El seed solo permite el destino Supabase local canónico y, con autorización explícita, elimina las identidades Auth locales antes de crearlas. **Destructivo también si corrés tests después** — cualquier archivo de test trunca las tablas de negocio (ver más abajo).

### Invitaciones y confirmación

Solo un ADMIN puede usar `POST /api/v1/usuarios`; el service vuelve a validar el rol,
valida todo el input con `schemas/usuario.schema.ts` y nunca copia roles desde metadata Auth.
Supabase envía el enlace local con `TokenHash` y `RedirectTo` a `/auth/confirm`; esa ruta
verifica `verifyOtp({ token_hash, type: "invite" })`, establece cookies y redirige a
`/auth/confirm/password`. La pantalla exige coincidencia y ocho caracteres como mínimo,
ejecuta `updateUser({ password })` y entra a `/contratos`. No se registran tokens.

En producción hay que configurar SMTP propio antes de invitar usuarios reales (host, puerto,
usuario y secreto se cargan en la configuración del proyecto o variables del entorno, nunca
en git). En el dashboard de Supabase, la plantilla Invite equivalente es:

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=invite">Aceptar invitación</a>
```

La plantilla local equivalente está en `supabase/templates/invite.html`; `supabase/config.toml`
mantiene signup público deshabilitado en `[auth]` y `[auth.email]` y una allowlist exacta para
`http://127.0.0.1:3000/auth/confirm`.

## Tests

```bash
set -a; . ./.env.local; set +a
npm test                                                      # todos (find + node --test, secuencial; el script exporta el marker)
INMOTRACK_ALLOW_DESTRUCTIVE_TESTS=1 node --import tsx --test --test-concurrency=1 tests/services/liquidaciones.service.test.ts   # un archivo puntual
node --import tsx --test tests/lib/estado-cobranza.test.ts    # tests puros (sin DB) — no hace falta --test-concurrency=1
npm run test:coverage                                         # gate 100% para helpers y clientes Supabase
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

El workflow `.github/workflows/supabase-local.yml` ejecuta el gate de la fase de base de datos contra un stack Supabase local efímero en Docker. Corre en cada push a `feat/supabase-integration`, en pull requests y mediante dispatch manual. Usa Node.js 22, levanta Supabase, exporta las claves reales del stack efímero desde `supabase status -o env`, resetea las migraciones, valida y genera Prisma, ejecuta el seed, la suite de tests, el gate de cobertura y el build de Next.js; siempre intenta detener Supabase al terminar. No incluye lint porque los cuatro errores existentes de lint no están relacionados con esta fase.

- [ ] `npx next build` sin errores de TypeScript
- [ ] `npm test` — decidir conscientemente si hace falta correr la suite completa (trunca la base real) o alcanza con el/los archivo(s) tocado(s)
- [ ] Si el cambio toca `prisma/schema.prisma`: migración aplicada siguiendo el flujo manual de arriba, no `migrate dev`
- [ ] Si el cambio agrega/cambia una ruta: actualizar [contracts.md](contracts.md)
- [ ] Si se descubre un gotcha no obvio: agregarlo a [traps.md](traps.md) en el mismo cambio
- [ ] Nunca `git commit`/`git push` salvo pedido explícito del usuario; nunca `git rebase` (usar `git pull` a secas para sincronizar)

## Deploy

Vercel. `vercel.json` define un único cron (`/api/v1/cron/activar-cierre-periodos`, `0 6 1 * *` — 1° de cada mes). No hay staging/preview con datos separados documentado — verificar antes de asumir que existe un entorno de pruebas remoto.
