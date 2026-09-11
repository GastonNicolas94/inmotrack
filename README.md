# InmoTrack

Sistema de gestión para una inmobiliaria/estudio contable (Macchieraldo Villarruel): contratos de alquiler, cobranza a inquilinos, punitorios por mora, gastos, libro diario inmutable y liquidación a propietarios (con adelantos a cuenta).

Next.js 16 (App Router) + Prisma 7 + PostgreSQL + Supabase Auth.

## Para agentes de IA

Este repo mantiene su propia documentación de contexto en [`docs/agent/`](docs/agent/) — léela antes de tocar código, es más rápida y más confiable que re-derivar todo desde cero:

1. [`docs/agent/overview.md`](docs/agent/overview.md) — qué hace el sistema, roles, mapa de capacidades → código
2. [`docs/agent/architecture.md`](docs/agent/architecture.md) — capas, layout de carpetas, flujo de request
3. [`docs/agent/contracts.md`](docs/agent/contracts.md) — rutas HTTP, acceso por rol, recursos de plataforma
4. [`docs/agent/runbook.md`](docs/agent/runbook.md) — comandos de dev/test/build/migraciones
5. [`docs/agent/traps.md`](docs/agent/traps.md) — gotchas no obvios ya encontrados

Reglas de convención de código y sistema de diseño: [`AGENTS.md`](AGENTS.md) (importado automáticamente por Claude Code vía `CLAUDE.md`).

Historia de decisiones de diseño de cada feature grande: [`docs/superpowers/specs/`](docs/superpowers/specs/) y [`docs/superpowers/plans/TODO.md`](docs/superpowers/plans/TODO.md) (deuda técnica y hallazgos pendientes conocidos).

## Quick start

Create `.env.local` (this is a local-only file and is gitignored):

```dotenv
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
DATABASE_POOL_MAX=5
```

Next loads `.env.local` for `npm run dev` and builds. Plain `node`/`tsx` commands
and `dotenv/config` do not automatically load `.env.local`, so export it in the
shell before seed, tests, or Prisma commands:

```bash
set -a; . ./.env.local; set +a
npm install
npm run supabase:start
npm run db:reset:local
read -rsp "Seed password: " seed_password; echo
export INMOTRACK_SEED_PASSWORD="$seed_password"
npm run seed
unset INMOTRACK_SEED_PASSWORD seed_password # use this same chosen value for the demo login
npm run dev       # http://localhost:3000
```

El desarrollo local requiere Docker Desktop (o un daemon compatible) para ejecutar
Supabase. La base queda en `127.0.0.1:54322`; si Docker no está disponible, los
comandos de Supabase y las pruebas que necesitan base quedan bloqueados.

Login de demo: `admin@inmotrack.com`, `empleado1@inmotrack.com` o `auditor@inmotrack.com`, con el valor que elegiste para `INMOTRACK_SEED_PASSWORD` durante el seed.

Ver [`docs/agent/runbook.md`](docs/agent/runbook.md) para variables de entorno, tests y el flujo de migraciones (Supabase + Prisma diff, nunca `prisma migrate dev`).
