import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

const SOLO_ADMIN: { pattern: RegExp; methods?: string[] }[] = [
  { pattern: /^\/api\/v1\/liquidaciones\/\d+\/confirmar-pago$/ },
  { pattern: /^\/api\/v1\/transacciones\/contra-asiento$/ },
  // Registrar un adelanto mueve plata real (EGRESO_ADELANTO) — mismo nivel
  // de sensibilidad que confirmar-pago/contra-asiento. Solo el POST (crear
  // el adelanto) es ADMIN-only; el GET (consultar pendiente) queda abierto
  // a cualquier rol autenticado, como el resto de las consultas de sólo
  // lectura de la app.
  { pattern: /^\/api\/v1\/propietarios\/\d+\/adelantos$/, methods: ["POST"] },
];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/v1/cron/")) {
    return NextResponse.next();
  }

  if (!req.auth) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error_code: "UNAUTHORIZED", message: "No autenticado." },
        { status: 401 }
      );
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rol = (req.auth.user as any)?.rol as string;

  const requiereAdmin = SOLO_ADMIN.some(
    ({ pattern, methods }) =>
      pattern.test(pathname) && (!methods || methods.includes(req.method))
  );
  if (requiereAdmin && rol !== "ADMIN") {
    return NextResponse.json(
      { error_code: "FORBIDDEN", message: "Acceso denegado." },
      { status: 403 }
    );
  }

  if (rol === "AUDITOR" && req.method !== "GET") {
    return NextResponse.json(
      { error_code: "FORBIDDEN", message: "Rol sin permisos de escritura." },
      { status: 403 }
    );
  }

  return NextResponse.next();
});

export const config = {
  // Excluye assets de _next y cualquier archivo estático servido desde
  // public/ (imágenes, íconos) — sin esto, un request directo a un
  // archivo como /logo.jpg cae en el auth-check y se redirige a /login
  // en vez de servir la imagen.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:jpg|jpeg|png|svg|gif|webp|ico)$).*)",
  ],
};
