"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
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
    const result = await signIn("credentials", {
      email: form.get("email"),
      password: form.get("password"),
      redirect: false,
    });
    if (result?.error) {
      setError("Email o contraseña incorrectos.");
    } else {
      router.push("/contratos");
    }
    setLoading(false);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6">
      {/* Halo decorativo, sutil, sin imágenes */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[-20%] h-[520px] bg-[radial-gradient(closest-side,_color-mix(in_oklch,var(--primary),transparent_88%),_transparent)]"
      />

      <div className="relative flex w-full max-w-sm flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG: next/image bloquea SVG local por defecto */}
        <img
          src="/logo-macchieraldo-villarruel-full.svg"
          alt="Macchieraldo Villarruel — Estudio Contable & Inmobiliaria"
          className="mb-2 h-80 w-80 object-contain"
        />

        <p className="mt-2 mb-8 text-center text-base text-muted-foreground">
          Iniciá sesión para gestionar contratos, propiedades e inquilinos.
        </p>

        <form
          onSubmit={handleSubmit}
          className="w-full rounded-3xl border border-border bg-card p-6 shadow-[0_20px_60px_-25px_rgba(0,0,0,0.25)]"
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
