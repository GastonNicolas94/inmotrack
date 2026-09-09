<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Sistema de diseño (rediseño estilo apple.com — ago 2026)

El frontend sigue una dirección visual deliberada inspirada en apple.com. Cualquier UI nueva debe respetarla, no reinventarla.

**Tokens — todo vive en `app/globals.css`, nunca hardcodear.**
- Paleta: fondo blanco puro (`--background: #fff`), texto casi negro (`--foreground: #1d1d1f`), texto secundario `--muted-foreground: #6e6e73`, acento único azul `--primary: #0071e3`, bordes hairline `--border: #d2d2d7`.
- Estados semánticos: usar siempre `bg-status-{success,warning,danger,neutral}-bg` + `text-status-{success,warning,danger,neutral}` (definidos en `@theme inline`). **Prohibido** usar clases de color crudas de Tailwind (`bg-green-100`, `text-red-700`, `bg-yellow-100`, etc.) para estados de negocio — si un estado nuevo no encaja en los 4 semánticos existentes, agregar el token en `globals.css`, no improvisar un color Tailwind suelto.
- Tipografía: `-apple-system, BlinkMacSystemFont` primero en el font-stack (SF Pro real en Mac/iPhone), Geist como fallback. No agregar otra fuente sin necesidad real.
- Radios: generosos (`--radius: 1rem` base). Contenedores de card/tabla usan `rounded-2xl`, diálogos y overlays `rounded-xl`.

**Componentes compartidos — reutilizar, no reinventar inline:**
- `components/layout/PageHeader.tsx` — header tipo "página de producto" (eyebrow + título editorial + descripción + acción). Usar en toda vista de listado nueva bajo `app/(dashboard)/`.
- `components/layout/DashboardNav.tsx` — nav del sidebar con estado activo por ruta.
- `components/layout/TableCard.tsx` — contenedor estándar de tabla (borde, radio, toolbar de acción). Toda tabla de listado nueva debe envolverse en esto, no repetir el `<div className="rounded-2xl border...">` a mano.
- `components/features/shared/BadgeEstadoPeriodo.tsx` y `PeriodoResumenRow.tsx` — estado y resumen de un período de pago (alquiler/expensa). Reutilizar en cualquier vista nueva que liste períodos, no duplicar el mapeo de colores por estado.

**Regla general:** si un bloque de JSX/clases se repite igual (o casi igual) en 2 o más archivos, extraerlo a un componente antes de seguir copiando. No dejar sistemas de diseño "a medias" con partes en componentes y partes in-line.

**Estructura de carpetas de componentes:**
- `components/ui/` — primitivos shadcn (`base-nova`). Ajustar tema/variantes acá, pero no meter componentes de dominio.
- `components/layout/` — patrones de layout transversales a toda la app (headers de página, nav, shells).
- `components/features/<dominio>/` — específico de un dominio (contratos, propietarios, propiedades, inquilinos).
- `components/features/shared/` — compartido entre 2+ dominios (ej. estado de período de pago).
