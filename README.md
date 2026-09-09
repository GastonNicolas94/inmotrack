# InmoTrack

Sistema de gestión para una inmobiliaria/estudio contable (Macchieraldo Villarruel): contratos de alquiler, cobranza a inquilinos, punitorios por mora, gastos, libro diario inmutable y liquidación a propietarios (con adelantos a cuenta).

Next.js 16 (App Router) + Prisma 7 + PostgreSQL + NextAuth v5.

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

```bash
npm install
npm run seed      # datos de demo (4 usuarios, propietarios, contratos, una liquidación real)
npm run dev       # http://localhost:3000
```

Login de demo: `admin@inmotrack.com` / `admin123` (ADMIN), `empleado1@inmotrack.com` / `admin123` (EMPLEADO), `auditor@inmotrack.com` / `admin123` (AUDITOR).

Ver [`docs/agent/runbook.md`](docs/agent/runbook.md) para variables de entorno, tests y el flujo de migraciones (manual, nunca `prisma migrate dev`).
