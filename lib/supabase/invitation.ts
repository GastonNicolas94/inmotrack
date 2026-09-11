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
