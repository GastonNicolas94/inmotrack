import { createBrowserSupabaseClient } from "./client";

type PasswordAuthClient = {
  auth: {
    signInWithPassword(credentials: {
      email: string;
      password: string;
    }): Promise<{ error: unknown | null }>;
  };
};

export type BrowserSupabaseClientFactory = () => PasswordAuthClient;
export type LoginAttempt = (
  email: string,
  password: string,
) => Promise<{ error: unknown | null }>;
export type LoginRouter = {
  replace(path: string): void;
  refresh(): void;
};

export async function signInWithPassword(
  email: string,
  password: string,
  createClient: BrowserSupabaseClientFactory = createBrowserSupabaseClient,
): Promise<{ error: unknown | null }> {
  return createClient().auth.signInWithPassword({ email, password });
}

export async function loginAndRedirect(
  email: string,
  password: string,
  router: LoginRouter,
  attempt: LoginAttempt = signInWithPassword,
  onAuthenticated?: () => void,
): Promise<boolean> {
  const { error } = await attempt(email, password);
  if (error) return false;
  onAuthenticated?.();
  // App Router fetches the new route automatically; refresh() can trigger redundant work.
  router.replace("/contratos");
  return true;
}
