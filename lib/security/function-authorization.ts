import { HttpError } from "@/lib/http-error";
import type { AuthenticatedUser } from "@/lib/auth-context";

export type Permission = "users:manage" | "liquidations:approve" | "contracts:write" | "reports:read";
export function requirePermission(user: AuthenticatedUser, permission: Permission): void {
  const allowed = permission === "users:manage" ? user.rol === "ADMIN"
    : permission === "liquidations:approve" ? user.rol === "ADMIN" || (user.rol === "EMPLEADO" && user.puedeAprobarLiquidaciones)
    : permission === "contracts:write" ? user.rol === "ADMIN" || user.rol === "EMPLEADO"
    : ["ADMIN", "EMPLEADO", "AUDITOR"].includes(user.rol);
  if (!allowed) throw new HttpError("FORBIDDEN", "Acceso denegado.", 403);
}
