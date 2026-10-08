"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginAndRedirect } from "@/lib/supabase/login";
import { PasswordEmailLanding } from "@/components/features/shared/PasswordEmailLanding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const email = form.get("email");
    const password = form.get("password");
    if (typeof email !== "string" || typeof password !== "string") {
      setError("Ingresá tu email y contraseña.");
      setLoading(false);
      return;
    }

    try {
      const loggedIn = await loginAndRedirect(email, password, router);
      if (!loggedIn) {
        setError("Email o contraseña incorrectos.");
      }
    } catch {
      setError("No se pudo iniciar sesión. Intentá nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6">
      <PasswordEmailLanding />

      <div className="relative flex w-full max-w-sm flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG: next/image bloquea SVG local por defecto */}
        <img
          src="/logo-macchieraldo-villarruel-full.svg"
          alt="Macchieraldo Villarruel — Estudio Contable & Inmobiliaria"
          className="mb-4 h-44 w-64 object-contain"
        />

        <p className="mt-2 mb-8 text-center text-[13px] text-muted-foreground">
          Iniciá sesión para gestionar contratos, propiedades e inquilinos.
        </p>

        <form
          onSubmit={handleSubmit}
          className="w-full rounded-lg border border-border bg-card p-6"
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="admin@inmotrack.com"
                className="h-10"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                name="password"
                type="password"
                className="h-10"
                required
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-status-danger">
                {error}
              </p>
            )}
            <Button type="submit" className="h-10 w-full text-sm" disabled={loading}>
              {loading ? "Ingresando…" : "Ingresar"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
