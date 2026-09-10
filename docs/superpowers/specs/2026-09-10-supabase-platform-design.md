# Supabase Platform — Diseño de integración

Fecha: 2026-09-10
Estado: Aprobado
Repositorio: GastonNicolas94/inmotrack

## 1. Objetivo

Integrar InmoTrack con Supabase como plataforma de base de datos, autenticación y tiempo real, preservando Prisma como ORM y la capa services como única autoridad para las reglas financieras.

La solución debe:

- desplegar PostgreSQL administrado en Supabase;
- reemplazar NextAuth por Supabase Auth;
- impedir el registro público y permitir que un ADMIN invite usuarios;
- conservar los roles ADMIN, EMPLEADO y AUDITOR;
- actualizar vistas abiertas cuando otro usuario cambia datos;
- ofrecer notificaciones internas persistentes para eventos financieros importantes;
- mantener los cron jobs en Vercel;
- permitir desarrollo local aislado mediante Supabase CLI;
- impedir que los tests destructivos alcancen la base remota;
- mantener la inmutabilidad del libro diario.

No hay datos reales que migrar. La base remota se inicializará desde cero y luego se cargarán datos de seed controlados.

## 2. Alcance

### Incluido

- Supabase PostgreSQL.
- Supavisor para conexiones desde Vercel.
- Supabase Auth con email y contraseña.
- Invitación de usuarios administrada desde InmoTrack.
- Sesiones SSR con cookies para Next.js 16.
- Supabase Realtime sobre un canal de eventos propio.
- Bandeja de notificaciones internas.
- Supabase CLI para el entorno local.
- Migraciones SQL versionadas.
- Configuración de variables de entorno en local y Vercel.
- RLS sobre las únicas tablas expuestas al navegador.
- Pruebas de autenticación, autorización, Realtime y seguridad.
- Security Advisor y Performance Advisor antes del corte a producción.
- Actualización de la documentación mantenida en docs/agent.

### Fuera de alcance

- Supabase Storage.
- Supabase Edge Functions.
- Supabase Cron.
- Registro público.
- Acceso directo desde el navegador a las tablas financieras.
- Reescritura de la lógica de negocio en funciones SQL o políticas RLS.
- Migración de datos de producción.
- Multi-tenant o múltiples inmobiliarias.
- Cambios funcionales al cálculo de pagos, punitorios, créditos o liquidaciones.

## 3. Decisión arquitectónica

Se adopta una integración Supabase nativa para Auth, Database y Realtime, manteniendo Prisma para toda la lógica de negocio.

Flujo de escritura:

Browser → Route Handler /api/v1 → validación Zod → service → Prisma transaction → PostgreSQL

El navegador nunca crea pagos, gastos, liquidaciones, aplicaciones de pago, transacciones ni contra-asientos mediante el Data API de Supabase. Las reglas de prelación, locks pesimistas, idempotencia y libro inmutable continúan en services y PostgreSQL.

Supabase Realtime no observará directamente todas las tablas de negocio. Los servicios escribirán eventos mínimos en una tabla app_events dentro de la misma transacción de negocio. El navegador se suscribirá exclusivamente a esa tabla.

Esta separación evita duplicar autorización financiera en el frontend, reduce la superficie expuesta por PostgREST y mantiene los límites existentes del proyecto.

## 4. Entornos y topología

### Desarrollo

- Supabase CLI ejecuta PostgreSQL, Auth, Realtime y Studio localmente.
- La base local es descartable y separada de producción.
- Los tests de integración usan una URL local explícita.
- El seed crea identidades de Auth y perfiles de dominio de demostración.
- Ningún secreto remoto se requiere para correr la suite local.

### Producción

- Se crea un proyecto Supabase nuevo y exclusivo para InmoTrack.
- Región: South America (São Paulo), AWS sa-east-1.
- Vercel debe ejecutar las funciones Node.js de InmoTrack en São Paulo, gru1, para minimizar la latencia servidor-base.
- Los Vercel Cron existentes se mantienen y llaman a los mismos endpoints protegidos por CRON_SECRET.
- No se reutiliza el proyecto inactivo supabase-management-real-state.

La selección de región es permanente para el proyecto Supabase; cambiarla posteriormente exige crear otro proyecto y migrar.

## 5. Conectividad Prisma

Se conservan Prisma 7, @prisma/adapter-pg y pg.

Variables:

- DATABASE_URL: conexión Supavisor Transaction Mode, puerto 6543, usada por la aplicación en Vercel.
- DIRECT_URL: conexión Supavisor Session Mode o directa, puerto 5432, usada por migraciones y administración.
- En local, ambas variables apuntan al PostgreSQL levantado por Supabase CLI.

lib/db.ts deberá:

- exigir DATABASE_URL fuera del desarrollo local;
- crear el Pool de pg con un límite conservador por instancia serverless;
- mantener una única instancia Prisma por proceso;
- no imprimir todas las consultas en producción;
- cerrar o reutilizar conexiones según el lifecycle soportado por PrismaPg.

prisma.config.ts deberá cargar el entorno y usar DIRECT_URL para operaciones de esquema. Se elimina el connection string local hardcodeado.

Los valores exactos de pool y timeouts se validarán con una prueba de carga pequeña y con el panel de conexiones de Supabase; no se introducirán réplicas ni poolers adicionales.

## 6. Estrategia de migraciones

El proyecto adopta una sola historia SQL en supabase/migrations. No se mantendrán dos sistemas activos de migraciones.

Proceso:

1. Instalar y fijar una versión de Supabase CLI compatible.
2. Inicializar supabase/config.toml.
3. Crear una migración baseline con supabase migration new.
4. Generar el SQL inicial desde prisma/schema.prisma mediante prisma migrate diff.
5. Incorporar al baseline el trigger de inmutabilidad de transacciones y cualquier SQL no representable por Prisma.
6. Aplicar desde cero con supabase db reset.
7. Regenerar Prisma Client.
8. Ejecutar seed y pruebas.
9. Vincular el proyecto remoto.
10. Revisar advisors.
11. Aplicar las migraciones al remoto mediante el flujo documentado de Supabase CLI.

prisma/schema.prisma continúa siendo la fuente de verdad del modelo que consume la aplicación. supabase/migrations es la fuente de verdad de la historia ejecutable, incluyendo RLS, publicaciones Realtime, triggers y grants.

prisma migrate dev permanece prohibido.

## 7. Autenticación

Supabase Auth reemplaza NextAuth por completo.

### Identidad y perfil

auth.users conserva identidad, credenciales y sesiones. La tabla public.usuarios conserva datos del dominio:

- id entero actual para no reescribir relaciones y auditoría;
- auth_user_id UUID único y obligatorio;
- email;
- rol;
- puede_aprobar_liquidaciones;
- id_propietario opcional.

password_hash se elimina de public.usuarios.

No se utilizará raw_user_meta_data ni user_metadata para autorización. El rol vigente se consulta en public.usuarios del lado servidor. Así, una modificación de permisos tiene efecto sin esperar a que expire un JWT.

La relación con auth.users se gestiona desde el servicio de usuarios. No se introduce una relación Prisma hacia el esquema auth. Si la creación en Auth tiene éxito y la creación del perfil falla, el servicio elimina inmediatamente la identidad recién creada. Esta compensación se prueba.

### Sesiones Next.js

Se agregan clientes separados:

- navegador: login, logout y suscripción Realtime;
- servidor: lectura y validación de sesión en Server Components y Route Handlers;
- proxy: renovación segura de cookies;
- admin: invitaciones y operaciones administrativas con SUPABASE_SECRET_KEY, solo en Node.js.

Se usa @supabase/ssr con flujo PKCE. La identidad para proteger rutas se valida con getClaims cuando la configuración del proyecto lo permita y con getUser cuando se necesite el registro actualizado. No se usa getSession como prueba de identidad.

Como Next.js 16 usa proxy.ts para este flujo, la implementación debe leer node_modules/next/dist/docs antes de reemplazar middleware.ts. La renovación de sesión y el RBAC actual deben integrarse en un único proxy sin importar dependencias Node.js incompatibles con ese runtime.

### Invitaciones y bootstrap

- El registro público queda deshabilitado.
- Un ADMIN invita usuarios desde la pantalla de usuarios.
- La invitación asigna rol y permiso de aprobación desde datos validados por Zod, nunca desde metadata enviada por el cliente.
- Se configura redirect URL para que el invitado establezca contraseña y entre a InmoTrack.
- Para producción se configura SMTP apropiado antes de invitar usuarios reales.
- Un script server-only crea el primer ADMIN. Requiere confirmación explícita de entorno y se niega a ejecutarse contra un destino ambiguo.
- El seed local crea los cuatro usuarios demo existentes mediante Auth Admin y sus perfiles.

## 8. Autorización

Se conserva el comportamiento actual:

- ADMIN: acceso completo.
- EMPLEADO: escritura general, salvo operaciones reservadas.
- AUDITOR: solo GET y respuestas con masking donde ya corresponde.
- EMPLEADO con puede_aprobar_liquidaciones: puede aprobar liquidaciones.
- Cron: sin sesión de usuario, protegido por Bearer CRON_SECRET.

Se centraliza un helper server-only que:

1. valida la identidad Supabase;
2. resuelve el perfil public.usuarios por auth_user_id;
3. devuelve un contexto autenticado tipado;
4. falla con 401 si no existe identidad o perfil;
5. falla con 403 si el rol no permite la operación.

Los handlers que requieren decisiones especiales, como aprobar liquidaciones, conservan su chequeo adicional. Las APIs no aceptan rol, usuario creador ni permisos enviados por el navegador.

SUPABASE_SECRET_KEY nunca se exporta con NEXT_PUBLIC_ ni se importa desde Client Components.

## 9. Realtime y eventos

### Modelo app_events

app_events contiene:

- id bigint generado;
- type enum o texto restringido;
- entity texto restringido;
- entity_id entero nullable cuando el evento sea global;
- message texto breve, sin información sensible;
- route ruta interna opcional;
- persistent boolean;
- created_by_user_id referencia al usuario de dominio;
- created_at timestamptz;
- expires_at timestamptz nullable.

No contendrá DNI, CUIT, CBU, teléfonos, emails, montos ni payloads arbitrarios.

Eventos iniciales:

- PAGO_REGISTRADO, persistente;
- GASTO_CREADO, solo invalidación;
- GASTO_PAGADO, solo invalidación;
- CONTRATO_ACTIVADO, solo invalidación;
- LIQUIDACION_GENERADA, persistente;
- LIQUIDACION_APROBADA, persistente;
- LIQUIDACION_PAGADA, persistente;
- CONTRA_ASIENTO_CREADO, persistente.

Cada evento se inserta dentro de la misma prisma.$transaction que confirma el cambio de negocio. Si la operación hace rollback, el evento también.

### Lecturas

app_event_reads contiene una clave compuesta por app_event_id y usuario_id, más read_at. Marcar una notificación como leída pasa por una ruta API y un servicio; el navegador no escribe directamente en tablas financieras.

### Suscripción cliente

Un RealtimeProvider dentro de DashboardShell:

- abre un único canal autenticado por pestaña;
- escucha INSERT sobre app_events;
- muestra un toast seguro;
- incrementa el contador para eventos persistentes no leídos;
- ejecuta router.refresh con debounce cuando el evento afecta la ruta abierta;
- evita duplicar el mismo evento por id;
- limpia el canal al desmontarse o cerrar sesión;
- refleja estados de conexión y recupera eventos perdidos desde la API después de reconectar.

El refetch sigue leyendo mediante Server Components y services. Realtime invalida; no reemplaza a Prisma como fuente de datos.

## 10. Notificaciones

Se agrega una bandeja accesible desde el dashboard con:

- contador de no leídas;
- listado paginado de eventos persistentes;
- enlace a la pantalla relacionada;
- acción para marcar una o todas como leídas;
- estado vacío;
- indicación de desconexión Realtime sin bloquear el uso normal.

Pagos, contra-asientos y cambios de estado de liquidaciones permanecen como historial interno. Los demás eventos se pueden eliminar mediante una política de retención porque solo sirven para sincronización de vistas.

La ausencia temporal de Realtime nunca invalida una operación de negocio. El usuario puede recargar y obtener el estado verdadero desde PostgreSQL.

## 11. Data API, RLS y publicaciones

Las tablas financieras no se conceden a anon ni authenticated y no se agregan a la publicación Realtime.

Solo app_events y app_event_reads se exponen al rol authenticated y se agregan explícitamente a la publicación necesaria. Esto considera el cambio de Supabase 2026 por el cual las tablas nuevas ya no se exponen automáticamente al Data API.

RLS:

- habilitada en ambas tablas expuestas;
- anon no tiene políticas ni grants;
- authenticated solo puede leer eventos si auth.uid() corresponde a un usuario interno activo;
- cada usuario solo puede leer sus filas de app_event_reads;
- las escrituras normales se realizan mediante el servidor;
- una eventual policy de escritura incluye USING y WITH CHECK;
- no se usa auth.role(), solamente TO authenticated con predicados de autorización;
- no se crean vistas con bypass de RLS;
- cualquier función privilegiada vive fuera de public, fija search_path, revoca EXECUTE a PUBLIC y valida identidad.

La clave publishable puede estar en el navegador. La clave secret nunca.

## 12. Manejo de errores

- Auth no disponible: login y validación devuelven un error claro sin degradar a acceso anónimo.
- Perfil faltante: sesión rechazada y evento operativo registrado; no se infiere un rol por defecto.
- Invitación parcial: compensación eliminando la identidad Auth creada.
- Realtime desconectado: indicador no bloqueante, backoff administrado por el SDK y recuperación vía API.
- Evento inválido: la operación de negocio falla antes del commit; los tipos se centralizan.
- Supabase DB no disponible: Prisma propaga el error y handleServiceError conserva la respuesta 500 actual.
- Pool agotado: timeout acotado, logging estructurado y revisión en Observability.
- Seed o test apuntando a remoto: fallo inmediato antes de cualquier DELETE o TRUNCATE.
- Cron sin CRON_SECRET correcto: 401 y ninguna operación.
- Rol cambiado durante una sesión: la siguiente autorización server-side usa el perfil actualizado.

## 13. Pruebas

### Unitarias

- mapeo de rutas afectadas por cada app event;
- deduplicación y debounce de refrescos;
- matriz de permisos;
- validación de variables y detección de URL remota;
- construcción de mensajes sin PII.

### Integración local

- login, logout, renovación y expiración;
- ADMIN invita usuario y se crea su perfil;
- compensación cuando falla la creación del perfil;
- EMPLEADO y AUDITOR respetan la matriz actual;
- usuario sin perfil recibe 401;
- operación de negocio y app_event confirman o revierten juntos;
- suscriptor autenticado recibe eventos;
- anon no puede leer eventos;
- un usuario no puede modificar lecturas de otro;
- reconexión recupera notificaciones perdidas;
- transacciones rechaza UPDATE y DELETE;
- Vercel Cron conserva autenticación separada.

Los tests destructivos exigen una marca explícita de entorno local/test y verifican host/puerto antes de limpiar. Se elimina el comportamiento actual que puede truncar DATABASE_URL sin distinguir producción.

### Verificación previa a producción

- npm run lint;
- npx next build;
- suite local secuencial;
- Supabase Security Advisor sin hallazgos críticos;
- Supabase Performance Advisor revisado;
- revisión de publicación Realtime;
- smoke test de los tres roles;
- smoke test del cron;
- revisión de conexiones y logs en Supabase;
- comprobación manual de que las claves secretas no aparecen en bundles ni respuestas.

## 14. Despliegue y corte

1. Implementar y verificar completamente contra Supabase local.
2. Crear el proyecto remoto nuevo en sa-east-1.
3. Configurar Auth, URLs y SMTP.
4. Aplicar baseline y migraciones.
5. Ejecutar el bootstrap del primer ADMIN.
6. Configurar variables en Vercel.
7. Desplegar una preview conectada a un entorno remoto descartable o mantenerla sin operaciones destructivas.
8. Ejecutar smoke tests.
9. Promover a producción.
10. Verificar login, una operación de escritura, Realtime y cron.
11. Retirar NEXTAUTH_SECRET y dependencias NextAuth una vez confirmado el corte.

No se migra gradualmente entre dos fuentes de identidad porque no existen usuarios reales que preservar. El corte es directo desde los usuarios demo de NextAuth hacia identidades nuevas de Supabase Auth.

## 15. Observabilidad y operación

- Desactivar log de todas las queries Prisma en producción.
- Log estructurado para fallos de Auth, invitaciones compensadas, desconexiones persistentes y errores de publicación.
- Usar Supabase Database Connections para vigilar saturación del pool.
- Revisar Auth Audit Logs y Database Logs durante el corte.
- Documentar cómo pausar, restaurar y regenerar credenciales.
- Definir retención para app_events no persistentes.
- Mantener los eventos persistentes necesarios para auditoría interna, sin tratarlos como sustituto de transacciones.

El libro diario sigue siendo la fuente contable. app_events es infraestructura de interfaz y notificación.

## 16. Archivos previstos

Crear:

- supabase/config.toml
- supabase/migrations/<baseline>.sql
- lib/supabase/client.ts
- lib/supabase/server.ts
- lib/supabase/proxy.ts
- lib/supabase/admin.ts
- lib/auth-context.ts
- services/eventos.service.ts
- schemas/usuario.schema.ts o extensión del schema existente
- components/features/notificaciones/RealtimeProvider.tsx
- components/features/notificaciones/NotificationBell.tsx
- components/features/notificaciones/NotificationPanel.tsx
- app/api/v1/notificaciones/route.ts
- app/api/v1/notificaciones/leer/route.ts
- scripts/bootstrap-admin.ts
- tests de Auth, RLS, eventos y guardas destructivas.

Modificar:

- prisma/schema.prisma;
- prisma.config.ts;
- lib/db.ts;
- proxy.ts, reemplazando la responsabilidad de middleware.ts;
- app de login y logout;
- DashboardShell;
- servicio y ruta de usuarios;
- servicios que emiten eventos;
- prisma/seed.ts;
- tests/helpers/db.ts;
- package.json y package-lock.json;
- vercel.json si se fija la región Node;
- docs/agent/overview.md;
- docs/agent/architecture.md;
- docs/agent/contracts.md;
- docs/agent/runbook.md;
- docs/agent/traps.md;
- README.md.

Eliminar al finalizar el corte:

- auth.config.ts;
- lib/auth.ts;
- handler de NextAuth;
- dependencias next-auth y bcryptjs si ya no quedan otros consumidores;
- password_hash del modelo y del seed;
- middleware.ts cuando proxy.ts absorba completamente su responsabilidad.

Los nombres finales de archivos deberán respetar las convenciones de Next.js 16 documentadas dentro de node_modules.

## 17. Criterios de aceptación

- La aplicación usa un proyecto Supabase nuevo en São Paulo.
- Local y producción no comparten base ni credenciales.
- Supabase Auth es la única fuente de sesiones.
- No existe registro público.
- Un ADMIN puede invitar usuarios y asignar roles.
- Los permisos actuales continúan funcionando.
- Prisma sigue siendo la única vía de escritura financiera.
- Ninguna tabla financiera queda disponible a anon o authenticated mediante Data API.
- Las vistas relevantes se actualizan tras cambios de otros usuarios.
- Existe bandeja de notificaciones para eventos importantes.
- La aplicación sigue funcionando si Realtime se desconecta.
- Vercel Cron mantiene su comportamiento y autenticación.
- Los tests no pueden truncar una base remota.
- El trigger de inmutabilidad sigue activo.
- Build, lint, pruebas y advisors pasan antes del despliegue.
- La documentación de agente refleja la arquitectura nueva.

## 18. Referencias vigentes al diseñar

- Supabase: Server-Side Rendering y guía Next.js.
- Supabase: Prisma.
- Supabase: Connecting to Postgres y Supavisor.
- Supabase: Realtime Postgres Changes.
- Supabase: Row Level Security.
- Supabase: Auth Admin inviteUserByEmail.
- Supabase: API keys.
- Supabase: Local development with CLI.
- Supabase: Available regions.
- Changelog de Supabase revisado el 2026-09-10.

Antes de implementar se vuelven a consultar estas guías y el changelog, ya que @supabase/ssr continúa marcado como beta y las convenciones pueden cambiar.
