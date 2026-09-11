import { createBrowserClient } from "@supabase/ssr";
import { readSupabasePublicEnv } from "./env.ts";

export function createBrowserSupabaseClient() {
  const { url, publishableKey } = readSupabasePublicEnv();
  return createBrowserClient(url, publishableKey);
}
