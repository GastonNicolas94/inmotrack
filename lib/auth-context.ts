import "server-only";

import { HttpError } from "@/lib/http-error";
import { setObservabilityUser } from "@/lib/observability/context";

export type AuthenticatedUser = {
  id: number;
  authUserId: string;
  email: string;
  rol: "ADMIN" | "EMPLEADO" | "AUDITOR";
  puedeAprobarLiquidaciones: boolean;
  idPropietario: number | null;
};

type AuthClaims = { sub?: unknown };
type ClaimsResult = {
  data: { claims: AuthClaims | null } | null;
  error: unknown;
};

type DomainProfile = {
  id: number;
  auth_user_id: string;
  email: string;
  rol: AuthenticatedUser["rol"];
  puede_aprobar_liquidaciones: boolean;
  id_propietario: number | null;
};

export type AuthContextDependencies = {
  getClaims: () => Promise<ClaimsResult>;
  findProfile: (authUserId: string) => Promise<DomainProfile | null>;
};

type PrismaProfileStore = {
  usuario: {
    findUnique(args: { where: { auth_user_id: string } }): Promise<DomainProfile | null>;
  };
};

type ServerSupabaseFactory = () => Promise<{
  auth: { getClaims: () => Promise<ClaimsResult> };
}>;

export type AuthContextRuntime = {
  prisma: PrismaProfileStore;
  createServerSupabaseClient: ServerSupabaseFactory;
};

export function createAuthContextDependencies(
  runtime: AuthContextRuntime,
): AuthContextDependencies {
  return {
    getClaims: async () => {
      const supabase = await runtime.createServerSupabaseClient();
      return supabase.auth.getClaims();
    },
    findProfile: (authUserId) =>
      runtime.prisma.usuario.findUnique({ where: { auth_user_id: authUserId } }),
  };
}

async function loadAuthContextRuntime(): Promise<AuthContextRuntime> {
  const [{ prisma }, { createServerSupabaseClient }] = await Promise.all([
    /* c8 ignore next -- module loading has no deterministic rejection branch */
    import("@/lib/db"),
    /* c8 ignore next -- module loading has no deterministic rejection branch */
    import("@/lib/supabase/server"),
  ]);
  return { prisma, createServerSupabaseClient };
}

async function defaultDependencies(): Promise<AuthContextDependencies> {
  return createAuthContextDependencies(await loadAuthContextRuntime());
}

export async function getAuthenticatedUser(
  dependencies?: AuthContextDependencies,
): Promise<AuthenticatedUser | null> {
  const { getClaims, findProfile } = dependencies ?? (await defaultDependencies());
  let claimsResult: ClaimsResult;
  try {
    claimsResult = await getClaims();
  } catch {
    return null;
  }
  const { data, error } = claimsResult;
  const subject = data?.claims?.sub;
  if (error || typeof subject !== "string" || subject.length === 0) return null;

  const profile = await findProfile(subject);
  if (!profile) return null;

  return {
    id: profile.id,
    authUserId: profile.auth_user_id,
    email: profile.email,
    rol: profile.rol,
    puedeAprobarLiquidaciones: profile.puede_aprobar_liquidaciones,
    idPropietario: profile.id_propietario,
  };
}

export async function requireAuthenticatedUser(
  dependencies?: AuthContextDependencies,
): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser(dependencies);
  if (!user) throw new HttpError("UNAUTHORIZED", "No autenticado.", 401);
  setObservabilityUser(user.id);
  return user;
}

export async function requireAdmin(
  dependencies?: AuthContextDependencies,
): Promise<AuthenticatedUser> {
  const user = await requireAuthenticatedUser(dependencies);
  if (user.rol !== "ADMIN") {
    throw new HttpError("FORBIDDEN", "Acceso denegado.", 403);
  }
  return user;
}

/**
 * Enforce the common write policy at the server boundary.  Route handlers
 * must call this after resolving the Supabase-backed domain profile; proxy
 * metadata is intentionally not sufficient for authorization.
 */
export function assertCanWrite(user: AuthenticatedUser): void {
  if (user.rol === "AUDITOR") {
    throw new HttpError("FORBIDDEN", "Rol sin permisos de escritura.", 403);
  }
}

/**
 * Liquidation approval is the one non-admin write delegated explicitly to an
 * employee.  An auditor can never approve, even if a stale permission flag
 * is present on a malformed profile.
 */
export function assertCanApproveLiquidation(user: AuthenticatedUser): void {
  if (
    user.rol !== "ADMIN" &&
    (user.rol !== "EMPLEADO" || !user.puedeAprobarLiquidaciones)
  ) {
    throw new HttpError("FORBIDDEN", "No puede aprobar liquidaciones.", 403);
  }
}

export async function requireDashboardUser(
  redirectToLogin: (path: string) => never,
  dependencies?: AuthContextDependencies,
): Promise<AuthenticatedUser> {
  try {
    return await requireAuthenticatedUser(dependencies);
  } catch (error) {
    if (error instanceof HttpError && error.code === "UNAUTHORIZED") {
      return redirectToLogin("/login");
    }
    throw error;
  }
}
