import "server-only";

import { createClient } from "@supabase/supabase-js";
import { readSupabasePublicEnv, readSupabaseSecret } from "./env.ts";

export function createAdminSupabaseClient() {
  const { url } = readSupabasePublicEnv();
  const secretKey = readSupabaseSecret();

  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
