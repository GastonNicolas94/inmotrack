import { createBrowserClient } from "@supabase/ssr";
import { readSupabasePublicEnv } from "./env.ts";

export function createBrowserSupabaseClient() {
  const { url, publishableKey } = readSupabasePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  return createBrowserClient(url, publishableKey);
}
