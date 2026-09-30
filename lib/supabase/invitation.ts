type InviteSessionClient = {
  auth: {
    setSession(input: { access_token: string; refresh_token: string }): Promise<{
      data: { session: unknown | null } | null;
      error: unknown | null;
    }>;
    getUser(): Promise<{
      data: { user: { id: string } | null };
      error: unknown | null;
    }>;
  };
};

export async function confirmDefaultInvite(
  fragment: string,
  clearFragment: () => void,
  createClient: () => InviteSessionClient,
): Promise<boolean> {
  // Remove credentials before initializing Auth or starting any navigation.
  clearFragment();
  const params = new URLSearchParams(fragment.replace(/^#/, ""));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (params.has("error") || params.get("type") !== "invite" || !accessToken || !refreshToken) {
    return false;
  }
  try {
    const client = createClient();
    const { data, error } = await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error || !data?.session) return false;
    const user = await client.auth.getUser();
    return !user.error && Boolean(user.data.user?.id);
  } catch {
    return false;
  }
}

export type InviteVerificationClient = {
  auth: {
    verifyOtp(input: { token_hash: string; type: "invite" }): Promise<{
      data: { session: unknown | null } | null;
      error: unknown | null;
    }>;
  };
};

export async function confirmInviteToken(
  client: InviteVerificationClient,
  tokenHash: string,
  type: string | null,
): Promise<boolean> {
  if (!tokenHash || type !== "invite") return false;
  try {
    const { data, error } = await client.auth.verifyOtp({
      token_hash: tokenHash,
      type: "invite",
    });
    return !error && Boolean(data?.session);
  } catch {
    return false;
  }
}

export function passwordValidationError(
  password: string,
  confirmation: string,
): string | null {
  if (!password) return "Ingresá una contraseña.";
  if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
  if (password !== confirmation) return "Las contraseñas no coinciden.";
  return null;
}
