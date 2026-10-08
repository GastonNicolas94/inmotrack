import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { applySecurityHeaders } from "@/lib/security/security-headers";

export async function proxy(request: NextRequest) {
  const response = await updateSession(request);
  applySecurityHeaders(response.headers);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:jpg|jpeg|png|svg|gif|webp|ico)$).*)",
  ],
};
