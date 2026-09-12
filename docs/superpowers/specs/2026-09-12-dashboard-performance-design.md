---
type: Spec
version: proposed
validated: 2026-09-12
update_when: Cambia el modelo de navegación, el flujo de carga del dashboard o los objetivos de rendimiento.
scope:
  - app/(dashboard)
  - components/layout
  - services
  - prisma
  - supabase/migrations
---

# Dashboard performance — diseño

## Objetivo

Hacer que el dashboard responda inmediatamente al navegar y reducir el tiempo real de carga, manteniendo Server Components, NextAuth, Prisma y las reglas de negocio actuales.

## Situación actual

- El menú usa `next/link`, pero las rutas son dinámicas porque leen sesión y PostgreSQL.
- No existe `app/(dashboard)/loading.tsx`; mientras el servidor responde no hay feedback.
- `/contratos` bloquea la vista esperando datos del wizard antes de iniciar la tabla.
- Algunos listados usan relaciones amplias que la UI no consume.
- Los índices nuevos deben justificarse con planes de ejecución y mediciones.

## Requisitos

1. El clic debe producir feedback inmediato sin desmontar el shell del dashboard.
2. La navegación debe seguir siendo una transición App Router, no una recarga del documento.
3. Los datos financieros y la autorización siguen resolviéndose en servidor.
4. Los listados devuelven solamente los campos que consume la UI.
5. Los cambios de índices se publican como migración Supabase y se validan antes de aplicar remotamente.
6. La comparación registra navegación fría y cálida para las ocho rutas del dashboard.
7. No se registran secretos, PII ni valores financieros en logs de rendimiento.

## Fuera de alcance

- Reescribir las páginas como Client Components.
- Agregar caché compartida, paginación o una base de staging sin evidencia.
- Cambiar TLS, autenticación, roles, RLS o reglas de negocio.

## Criterios de aceptación

- El usuario recibe feedback visual inmediato durante navegación lenta.
- Header, menú y fallbacks pueden mostrarse antes que las tablas.
- Las ocho pantallas conservan contenido, acciones y permisos.
- Tests y build pasan, y las mediciones posteriores no empeoran la mediana cálida.
- No se agrega ningún índice sin evidencia de `EXPLAIN (ANALYZE, BUFFERS)` o Advisors.
