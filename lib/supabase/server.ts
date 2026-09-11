import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers.js";
import { readSupabasePublicEnv } from "./env.ts";

type ServerCookieStore = {
  getAll(): Array<{ name: string; value: string }>;
  set(name: string, value: string, options?: Parameters<Awaited<ReturnType<typeof import("next/headers.js").cookies>>["set"]>[2]): void;
};

export function createServerCookieAdapter(cookieStore: ServerCookieStore) {
  return {
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet: { name: string; value: string; options: Parameters<ServerCookieStore["set"]>[2] }[], headers: Record<string, string>) {
      try {
        // The proxy applies these response headers in the request pipeline.
        void headers;
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      } catch {
        // Server Components cannot persist cookies; the proxy owns them.
      }
    },
  };
}

export async function createServerSupabaseClient(cookieStore?: ServerCookieStore) {
  if (!cookieStore) cookieStore = await cookies();
  return createServerSupabaseClientFromStore(cookieStore);
}

function createServerSupabaseClientFromStore(cookieStore: ServerCookieStore) {
  const { url, publishableKey } = readSupabasePublicEnv();

  return createServerClient(url, publishableKey, {
    cookies: createServerCookieAdapter(cookieStore),
  });
}
