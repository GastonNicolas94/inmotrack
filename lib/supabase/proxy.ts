import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readSupabasePublicEnv } from "./env";

type ProxyClaims = { sub?: unknown };
type ProxyClaimsResult = {
  data: { claims: ProxyClaims | null } | null;
  error: unknown;
};

type SupabaseProxyClient = {
  auth: { getClaims: () => Promise<ProxyClaimsResult> };
};

type SetAll = (
  cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>,
  headers: Record<string, string>,
) => void;

export type ProxyClientFactory = (
  request: NextRequest,
  setAll: SetAll,
) => SupabaseProxyClient;

const NO_STORE_HEADERS = {
  "cache-control": "private, no-cache, no-store, must-revalidate, max-age=0",
  expires: "0",
  pragma: "no-cache",
  vary: "Cookie",
};

function isExactOrChild(pathname: string, basePath: string): boolean {
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}

export function isPublicProxyPath(pathname: string): boolean {
  return (
    isExactOrChild(pathname, "/login") ||
    pathname === "/auth/confirm" ||
    pathname.startsWith("/api/v1/cron/") ||
    isExactOrChild(pathname, "/_next/static") ||
    isExactOrChild(pathname, "/_next/image") ||
    pathname === "/favicon.ico" ||
    /\.(?:jpg|jpeg|png|svg|gif|webp|ico)$/.test(pathname)
  );
}

function setNoStoreHeaders(response: NextResponse): void {
  for (const [name, value] of Object.entries(NO_STORE_HEADERS)) {
    response.headers.set(name, value);
  }
}

const SAFE_RESPONSE_HEADERS = new Set([
  "cache-control",
  "expires",
  "pragma",
  "vary",
]);

function copyResponseState(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) to.cookies.set(cookie);
  for (const [name, value] of from.headers.entries()) {
    if (SAFE_RESPONSE_HEADERS.has(name.toLowerCase())) to.headers.set(name, value);
  }
  return to;
}

function defaultClientFactory(request: NextRequest, setAll: SetAll): SupabaseProxyClient {
  const { url, publishableKey } = readSupabasePublicEnv();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll,
    },
  });
}

export async function updateSession(
  request: NextRequest,
  createClient: ProxyClientFactory = defaultClientFactory,
): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;
  if (isPublicProxyPath(pathname)) return NextResponse.next();

  let response = NextResponse.next({ request });
  setNoStoreHeaders(response);

  const setAll: SetAll = (cookiesToSet, headers) => {
    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
    response = NextResponse.next({ request });
    cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    for (const [name, value] of Object.entries(headers)) {
      if (SAFE_RESPONSE_HEADERS.has(name.toLowerCase())) response.headers.set(name, value);
    }
    setNoStoreHeaders(response);
  };

  let claims: ProxyClaims | null = null;
  try {
    const result = await createClient(request, setAll).auth.getClaims();
    claims = result.error ? null : result.data?.claims ?? null;
  } catch {
    claims = null;
  }

  if (!claims || typeof claims.sub !== "string" || claims.sub.length === 0) {
    const unauthenticated = pathname.startsWith("/api/")
      ? NextResponse.json(
          { error_code: "UNAUTHORIZED", message: "No autenticado." },
          { status: 401 },
        )
      : NextResponse.redirect(new URL("/login", request.url));
    return copyResponseState(response, unauthenticated);
  }

  return response;
}
