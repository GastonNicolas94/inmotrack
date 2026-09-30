"use client";

import { useEffect, useRef } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { confirmDefaultInvite } from "@/lib/supabase/invitation";

export default function ConfirmDefaultInvitePage() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void confirmDefaultInvite(
      window.location.hash,
      () => window.history.replaceState(window.history.state, "", window.location.pathname),
      createBrowserSupabaseClient,
    ).then((verified) => {
      // A full navigation makes the server gate observe the newly written SSR cookies.
      window.location.replace(verified ? "/auth/confirm/password" : "/login?error=invite_invalid");
    });
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <p role="status" className="text-sm text-muted-foreground">Confirmando tu invitación…</p>
    </main>
  );
}
