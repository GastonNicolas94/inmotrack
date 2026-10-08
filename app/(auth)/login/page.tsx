"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, FileText, HandCoins, LoaderCircle, Wallet } from "lucide-react";
import { loginAndRedirect } from "@/lib/supabase/login";
import { PasswordEmailLanding } from "@/components/features/shared/PasswordEmailLanding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CAPABILITIES = [
  { icon: FileText, label: "Contratos y propiedades", detail: "Toda tu cartera, organizada." },
  { icon: Wallet, label: "Cobros y gastos", detail: "Control de cada movimiento." },
  { icon: HandCoins, label: "Liquidaciones", detail: "Rendiciones claras a propietarios." },
] as const;

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"idle" | "authenticating" | "redirecting">("idle");
  // A ref locks synchronously, before React paints the disabled state.
  const submissionInProgress = useRef(false);
  const loading = phase !== "idle";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionInProgress.current) return;
    submissionInProgress.current = true;
    setPhase("authenticating");
    setError("");
    const form = new FormData(event.currentTarget);
    const email = form.get("email");
    const password = form.get("password");
    if (typeof email !== "string" || typeof password !== "string") {
      setError("Ingresá tu correo electrónico y contraseña.");
      setPhase("idle");
      submissionInProgress.current = false;
      return;
    }

    try {
      const loggedIn = await loginAndRedirect(
        email,
        password,
        router,
        undefined,
        () => setPhase("redirecting"),
      );
      if (loggedIn) {
        // replace/refresh initiates navigation but does not wait until it completes.
        // Keep the button disabled and the loader visible until this page unmounts.
        return;
      }
      setError("Correo electrónico o contraseña incorrectos.");
    } catch {
      setError("No se pudo iniciar sesión. Intentá nuevamente.");
    }
    // Only unlock on failure. A successful login must not allow another click.
    submissionInProgress.current = false;
    setPhase("idle");
  }

  return (
    <main className="flex min-h-screen items-center bg-background px-4 py-8 sm:px-6 sm:py-12">
      <PasswordEmailLanding />
      <div className="mx-auto grid w-full max-w-[1040px] items-center gap-8 md:grid-cols-2 md:gap-12 lg:gap-20">
        <section aria-label="Acerca de InmoTrack" className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-primary" aria-hidden="true">
              <Building2 className="size-[22px]" strokeWidth={1.8} />
            </span>
            <span className="font-heading text-[19px] font-bold text-foreground">InmoTrack</span>
          </div>

          <p className="inmotrack-eyebrow mt-9 sm:mt-12">Gestión inmobiliaria</p>
          <h1 className="mt-3 max-w-[440px] font-heading text-[24px] font-bold leading-[1.3] text-foreground md:text-[30px] md:font-extrabold">
            Toda tu operación inmobiliaria, en un solo lugar.
          </h1>
          <p className="mt-4 max-w-[415px] text-[13px] leading-6 text-muted-foreground">
            Contratos, cobros, gastos y liquidaciones organizados para que puedas
            gestionar cada día con claridad.
          </p>

          <ul className="mt-9 hidden max-w-[415px] divide-y divide-border border-t border-border md:block" aria-label="Qué podés gestionar">
            {CAPABILITIES.map(({ icon: Icon, label, detail }) => (
              <li key={label} className="flex items-center gap-3 py-4">
                <Icon aria-hidden="true" className="size-[19px] shrink-0 text-muted-foreground" strokeWidth={1.8} />
                <span className="flex flex-col gap-1">
                  <span className="text-[12px] font-bold text-foreground">{label}</span>
                  <span className="text-[11px] text-muted-foreground">{detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="login-heading" className="rounded-lg border border-border bg-card px-5 py-7 sm:px-8 sm:py-9">
          <p className="inmotrack-eyebrow">Acceso a la plataforma</p>
          <h2 id="login-heading" className="mt-2 font-heading text-[18px] font-bold text-foreground">
            Iniciá sesión
          </h2>
          <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
            Ingresá con tus credenciales para continuar.
          </p>

          <form onSubmit={handleSubmit} aria-busy={loading} className="mt-7 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="username"
                placeholder="tu@correo.com"
                className="h-11"
                disabled={loading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Ingresá tu contraseña"
                className="h-11"
                disabled={loading}
                required
              />
            </div>

            {error ? (
              <p role="alert" className="rounded-md bg-status-danger-bg px-3 py-2 text-[12px] text-status-danger">
                {error}
              </p>
            ) : null}

            <Button type="submit" size="lg" className="h-12 w-full justify-center gap-2 rounded-lg text-[13px] sm:h-[46px]" disabled={loading}>
              {loading ? (
                <>
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                  {phase === "redirecting" ? "Abriendo InmoTrack…" : "Ingresando…"}
                </>
              ) : (
                <>
                  Ingresar a InmoTrack
                  <ArrowRight aria-hidden="true" className="size-4" />
                </>
              )}
            </Button>
            <p role="status" aria-live="polite" aria-atomic="true" className="min-h-5 text-center text-[11px] text-muted-foreground">
              {phase === "authenticating"
                ? "Validando tus credenciales…"
                : phase === "redirecting"
                  ? "Acceso confirmado. Cargando tus contratos…"
                  : ""}
            </p>
          </form>
          <p className="mt-6 border-t border-border pt-5 text-[11px] leading-5 text-muted-foreground">
            Acceso exclusivo para usuarios autorizados.
          </p>
        </section>
      </div>
    </main>
  );
}
