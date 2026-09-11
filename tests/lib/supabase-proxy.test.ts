import test from "node:test";
import assert from "node:assert/strict";
import type { CookieOptions } from "@supabase/ssr";
import { NextRequest } from "next/server";
import {
  isPublicProxyPath,
  updateSession,
  type ProxyClientFactory,
} from "../../lib/supabase/proxy.ts";
import { proxy } from "../../proxy.ts";

function request(pathname: string): NextRequest {
  return new NextRequest(`http://localhost${pathname}`);
}

function factoryFor(
  result: { data: { claims: { sub?: unknown } | null } | null; error: unknown },
  setCookies?: boolean,
): ProxyClientFactory {
  return (_request, setAll) => ({
    auth: {
      async getClaims() {
        if (setCookies) {
          setAll(
            [{ name: "sb-session", value: "refreshed", options: { path: "/" } as CookieOptions }],
            {
              "cache-control": "private, no-store",
              "x-supabase-internal": "must-not-leak",
            },
          );
        }
        return result;
      },
    },
  });
}

test("recognizes login, callback, cron and static assets as public", () => {
  for (const pathname of [
    "/login",
    "/login/anything",
    "/auth/confirm",
    "/api/v1/cron/cierre-periodo",
    "/_next/static/chunk.js",
    "/_next/image?url=%2Flogo.svg",
    "/favicon.ico",
    "/logo.svg",
  ]) {
    assert.equal(isPublicProxyPath(pathname), true, pathname);
  }
  assert.equal(isPublicProxyPath("/api/v1/cronograma"), false);
  assert.equal(isPublicProxyPath("/api/v1/cron"), false);
  assert.equal(isPublicProxyPath("/login-evil"), false);
  assert.equal(isPublicProxyPath("/auth/callback"), false);
  assert.equal(isPublicProxyPath("/auth/callback/subroute"), false);
  assert.equal(isPublicProxyPath("/auth/callback-evil"), false);
  assert.equal(isPublicProxyPath("/auth/confirm/password"), false);
  assert.equal(isPublicProxyPath("/auth/confirm-evil"), false);
  assert.equal(isPublicProxyPath("/api/auth-evil"), false);
  assert.equal(isPublicProxyPath("/_next/static-evil/chunk.js"), false);
  assert.equal(isPublicProxyPath("/_next/image-evil"), false);
  assert.equal(isPublicProxyPath("/dashboard/logo.txt"), false);
});

test("does not call Supabase for public paths", async () => {
  let called = false;
  const response = await updateSession(request("/login"), () => {
    called = true;
    throw new Error("public path should bypass the client");
  });
  assert.equal(response.status, 200);
  assert.equal(called, false);
});

test("protects the callback path and every callback subroute", async () => {
  for (const pathname of ["/auth/callback", "/auth/callback/subroute"]) {
    const response = await updateSession(
      request(pathname),
      factoryFor({ data: { claims: null }, error: new Error("missing session") }),
    );
    assert.equal(response.status, 307, pathname);
    assert.equal(response.headers.get("location"), "http://localhost/login", pathname);
  }
});

test("allows a validated identity and keeps refresh cookies", async () => {
  const response = await updateSession(
    request("/contratos"),
    factoryFor({ data: { claims: { sub: "auth-1" } }, error: null }, true),
  );
  assert.equal(response.status, 200);
  assert.equal(response.cookies.get("sb-session")?.value, "refreshed");
  assert.equal(response.headers.get("cache-control"), "private, no-cache, no-store, must-revalidate, max-age=0");
  assert.equal(response.headers.get("x-supabase-internal"), null);
});

test("redirects an unauthenticated page without leaking middleware headers", async () => {
  const response = await updateSession(
    request("/contratos"),
    factoryFor({ data: { claims: null }, error: new Error("expired") }, true),
  );
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "http://localhost/login");
  assert.equal(response.cookies.get("sb-session")?.value, "refreshed");
  assert.equal(response.headers.get("x-middleware-next"), null);
  assert.equal(response.headers.get("x-middleware-override-headers"), null);
  assert.equal(response.headers.get("x-supabase-internal"), null);
});

test("returns a JSON 401 for an unauthenticated API request", async () => {
  const response = await updateSession(
    request("/api/v1/contratos"),
    factoryFor({ data: { claims: {} }, error: null }),
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error_code: "UNAUTHORIZED",
    message: "No autenticado.",
  });
  assert.equal(response.headers.get("x-middleware-next"), null);
});

test("treats an empty subject as unauthenticated", async () => {
  const response = await updateSession(
    request("/api/v1/contratos"),
    factoryFor({ data: { claims: { sub: "" } }, error: null }),
  );
  assert.equal(response.status, 401);
});

test("treats a null claims payload as unauthenticated", async () => {
  const response = await updateSession(
    request("/api/v1/contratos"),
    factoryFor({ data: null, error: null }),
  );
  assert.equal(response.status, 401);
});

test("fails closed when the default client cannot be configured", async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  try {
    const response = await updateSession(request("/contratos"));
    assert.equal(response.status, 307);
  } finally {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
  }
});

test("the root proxy delegates to the Supabase session gate", async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  try {
    const response = await proxy(request("/contratos"));
    assert.equal(response.status, 307);
  } finally {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
  }
});

test("fails closed when the Supabase client throws", async () => {
  const response = await updateSession(request("/contratos"), () => ({
    auth: {
      getClaims: async () => {
        throw new Error("network failure");
      },
    },
  }));
  assert.equal(response.status, 307);
});
