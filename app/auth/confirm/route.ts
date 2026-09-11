import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { confirmInviteToken, type InviteVerificationClient } from "@/lib/supabase/invitation";

function safeRedirect(url: URL): NextResponse {
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function invalidInviteResponse(request: Request): NextResponse {
  return safeRedirect(new URL("/login?error=invite_invalid", request.url));
}

export async function confirmInvitation(
  request: Request,
  createClient: () => Promise<InviteVerificationClient> = createServerSupabaseClient,
): Promise<NextResponse> {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash")?.trim() ?? "";
  const type = url.searchParams.get("type");
  if (!tokenHash || type !== "invite") return invalidInviteResponse(request);

  let supabase: InviteVerificationClient;
  try {
    supabase = await createClient();
  } catch {
    return invalidInviteResponse(request);
  }
  const verified = await confirmInviteToken(supabase, tokenHash, type);
  if (!verified) return invalidInviteResponse(request);

  return safeRedirect(new URL("/auth/confirm/password", request.url));
}

export async function GET(request: Request): Promise<NextResponse> {
  return confirmInvitation(request);
}
