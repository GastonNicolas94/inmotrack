import "server-only";

import { aplicarMasking } from "@/lib/masking";
import { HttpError } from "@/lib/http-error";
import { readAppUrl } from "@/lib/supabase/env";
import { invitarUsuarioSchema, type InvitarUsuarioInput } from "@/schemas/usuario.schema";
import type { AuthenticatedUser } from "@/lib/auth-context";

type InviteUserResult = {
  data: { user: { id: string } | null } | null;
  error: { code?: string; status?: number; message?: string } | null;
};

type AdminClient = {
  auth: {
    admin: {
      inviteUserByEmail(
        email: string,
        options: { redirectTo: string },
      ): Promise<InviteUserResult>;
      deleteUser(id: string): Promise<{ error: unknown | null }>;
    };
  };
};

type PublicUsuario = {
  id: number;
  email: string;
  rol: AuthenticatedUser["rol"];
  puede_aprobar_liquidaciones: boolean;
  id_propietario?: number | null;
};

type PrismaUsuarioStore = {
  usuario: {
    create(args: {
      data: {
        email: string;
        auth_user_id: string;
        rol: InvitarUsuarioInput["rol"];
        puede_aprobar_liquidaciones: boolean;
        id_propietario: number | null;
      };
      select: {
        id: true;
        email: true;
        rol: true;
        puede_aprobar_liquidaciones: true;
        id_propietario: true;
      };
    }): Promise<PublicUsuario>;
    findMany(args: {
      select: {
        id: true;
        email: true;
        rol: true;
        puede_aprobar_liquidaciones: true;
      };
      orderBy: { email: "asc" };
    }): Promise<PublicUsuario[]>;
  };
};

export type UsuariosServiceDependencies = {
  admin: AdminClient;
  prisma: PrismaUsuarioStore;
  appUrl?: string;
};

const publicUsuarioSelect = {
  id: true,
  email: true,
  rol: true,
  puede_aprobar_liquidaciones: true,
  id_propietario: true,
} as const;

function duplicateAuthError(error: InviteUserResult["error"]): boolean {
  const code = error?.code?.toLowerCase();
  const message = error?.message?.toLowerCase() ?? "";
  return (
    code === "email_exists" ||
    code === "user_already_exists" ||
    (error?.status === 422 && /(already|exists|duplicate)/.test(message)) ||
    /(email|user).*(already|exists|duplicate)/.test(message)
  );
}

function publicInvitationError(): HttpError {
  return new HttpError("INVITATION_ERROR", "No se pudo completar la invitación.", 500);
}

type ProfileConflictTarget = "email" | "auth_user_id" | "unknown" | null;

function profileConflictTarget(error: unknown): ProfileConflictTarget {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    (error as { code?: unknown }).code !== "P2002"
  ) {
    return null;
  }

  const metadata =
    "meta" in error && typeof error.meta === "object" && error.meta !== null
      ? (error.meta as { target?: unknown })
      : {};
  const target = metadata.target;
  const fields = Array.isArray(target) ? target : typeof target === "string" ? [target] : [];
  if (fields.includes("auth_user_id")) return "auth_user_id";
  if (fields.includes("email")) return "email";
  return "unknown";
}

function duplicateProfileError(): HttpError {
  return new HttpError("DUPLICATE_EMAIL", "El email ya está registrado.", 409);
}

async function compensateCreatedIdentity(admin: AdminClient, authUserId: string): Promise<void> {
  try {
    await admin.auth.admin.deleteUser(authUserId);
  } catch {
    // Cleanup failures never replace or expose the original public error.
  }
}

/* c8 ignore next -- dependency wiring is exercised by Next.js runtime/build */
async function defaultDependencies(): Promise<UsuariosServiceDependencies> {
  const [{ createAdminSupabaseClient }, { prisma }] = await Promise.all([
    /* c8 ignore next -- module loading has no deterministic rejection branch */
    import("@/lib/supabase/admin"),
    /* c8 ignore next -- module loading has no deterministic rejection branch */
    import("@/lib/db"),
  ]);
  return { admin: createAdminSupabaseClient(), prisma };
}

export function createUsuariosService(
  dependencies?: UsuariosServiceDependencies,
) {
  async function deps(): Promise<UsuariosServiceDependencies> {
    return dependencies ?? defaultDependencies();
  }

  return {
    async invitar(input: unknown, actor: AuthenticatedUser): Promise<PublicUsuario> {
      if (actor.rol !== "ADMIN") {
        throw new HttpError("FORBIDDEN", "Acceso denegado.", 403);
      }

      const parsed = invitarUsuarioSchema.safeParse(input);
      if (!parsed.success) {
        throw new HttpError("VALIDATION_ERROR", "Datos inválidos.", 400);
      }

      const runtime = await deps();
      const appUrl = runtime.appUrl ? readAppUrl({ APP_URL: runtime.appUrl }) : readAppUrl();
      let invited: InviteUserResult;
      try {
        invited = await runtime.admin.auth.admin.inviteUserByEmail(parsed.data.email, {
          redirectTo: `${appUrl}/auth/confirm`,
        });
      } catch (error) {
        if (duplicateAuthError(error as InviteUserResult["error"])) {
          throw new HttpError("DUPLICATE_EMAIL", "El email ya está registrado.", 409);
        }
        throw publicInvitationError();
      }

      if (invited.error) {
        if (duplicateAuthError(invited.error)) {
          throw new HttpError("DUPLICATE_EMAIL", "El email ya está registrado.", 409);
        }
        throw publicInvitationError();
      }

      const authUserId = invited.data?.user?.id;
      if (!authUserId) throw publicInvitationError();

      try {
        return await runtime.prisma.usuario.create({
          data: {
            email: parsed.data.email,
            auth_user_id: authUserId,
            rol: parsed.data.rol,
            puede_aprobar_liquidaciones: parsed.data.puede_aprobar_liquidaciones,
            id_propietario: parsed.data.id_propietario,
          },
          select: publicUsuarioSelect,
        });
      } catch (error) {
        // Admin invite success returns the newly created identity, while a
        // duplicate email is an error. An email conflict belongs to this
        // operation's profile attempt, so compensate its exact ID; an
        // auth_user_id conflict may belong to a concurrent winner and must be
        // preserved. Unknown/non-Prisma failures safely compensate the exact
        // identity returned by this invite.
        const conflictTarget = profileConflictTarget(error);
        if (conflictTarget === "auth_user_id") throw duplicateProfileError();
        if (conflictTarget === "email") {
          await compensateCreatedIdentity(runtime.admin, authUserId);
          throw duplicateProfileError();
        }
        await compensateCreatedIdentity(runtime.admin, authUserId);
        throw publicInvitationError();
      }
    },

    async listar(actor: AuthenticatedUser): Promise<PublicUsuario[]> {
      const runtime = await deps();
      const users = await runtime.prisma.usuario.findMany({
        select: {
          id: true,
          email: true,
          rol: true,
          puede_aprobar_liquidaciones: true,
        },
        orderBy: { email: "asc" },
      });
      return users.map((user) => aplicarMasking(user, actor.rol) as PublicUsuario);
    },
  };
}

export const UsuariosService = createUsuariosService();
