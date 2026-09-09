/**
 * Valida el header Authorization: Bearer <CRON_SECRET> que Vercel Cron
 * manda automáticamente en cada invocación programada, contra la
 * variable de entorno CRON_SECRET. Compartido por los dos endpoints
 * bajo /api/v1/cron/* (ya exceptuados de auth de sesión en middleware.ts).
 */
export function validarCronSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}
