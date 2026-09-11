"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { passwordValidationError } from "@/lib/supabase/invitation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ConfirmPasswordPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = form.get("password");
    const confirmation = form.get("confirmation");
    if (typeof password !== "string" || typeof confirmation !== "string") {
      setError("Completá ambos campos.");
      return;
    }

    const validationError = passwordValidationError(password, confirmation);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const { error: updateError } = await createBrowserSupabaseClient().auth.updateUser({ password });
      if (updateError) {
        setError("No se pudo establecer la contraseña. Volvé a solicitar la invitación.");
        return;
      }
      router.replace("/contratos");
      router.refresh();
    } catch {
      setError("No se pudo establecer la contraseña. Volvé a solicitar la invitación.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5 rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Creá tu contraseña</h1>
          <p className="mt-2 text-sm text-muted-foreground">Ya confirmamos tu invitación. Elegí una contraseña para entrar a InmoTrack.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmation">Repetir contraseña</Label>
          <Input id="confirmation" name="confirmation" type="password" autoComplete="new-password" required />
        </div>
        {error && <p role="alert" className="text-sm text-status-danger">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Guardando…" : "Entrar a InmoTrack"}
        </Button>
      </form>
    </main>
  );
}
