import { createServerSupabaseClient } from "./server";
import { HttpError } from "@/lib/http-error";

type ServerAuthClient = {
  auth: {
    signOut(): Promise<{ error: unknown | null }>;
  };
};

export type ServerSupabaseClientFactory = () => Promise<ServerAuthClient>;
export type Redirect = (path: string) => never | void;

export async function signOutAndRedirect(
  redirectFn: Redirect,
  createClient: ServerSupabaseClientFactory = createServerSupabaseClient,
  redirectTo: string = "/login",
): Promise<never | void> {
  const { error } = await (await createClient()).auth.signOut();
  if (error) {
    throw new HttpError("LOGOUT_FAILED", "No se pudo cerrar sesión.", 500);
  }
  return redirectFn(redirectTo);
}
