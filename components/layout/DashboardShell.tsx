"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardNav, NAV_ITEMS } from "@/components/layout/DashboardNav";
import { cn } from "@/lib/utils";
import type { AuthenticatedUser } from "@/lib/auth-context";

const STORAGE_KEY = "inmotrack:sidebar-collapsed";
const MOBILE_HREFS = ["/", "/contratos", "/pagos", "/propiedades", "/liquidaciones"];

export function DashboardShell({ email, rol, onLogout, showTestClock, children }: {
  email: string;
  rol: AuthenticatedUser["rol"];
  onLogout: (formData: FormData) => void | Promise<void>;
  showTestClock?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (localStorage.getItem(STORAGE_KEY) === "1") setCollapsed(true);
  }, []);
  useEffect(() => {
    // Close the drawer when route changes (includes browser back/forward).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileOpen(false);
  }, [pathname]);

  const pageName = NAV_ITEMS.find((item) => item.href === pathname)?.label
    ?? NAV_ITEMS.find((item) => item.href !== "/" && pathname.startsWith(item.href))?.label
    ?? (pathname.startsWith("/dev/") ? "Reloj de pruebas" : "InmoTrack");
  const initial = email.trim().charAt(0).toUpperCase() || "U";

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className="inmotrack-shell bg-background">
      {mobileOpen ? <button type="button" className="inmotrack-scrim inmotrack-mobile-only"
        aria-label="Cerrar menú lateral" onClick={() => setMobileOpen(false)} /> : null}
      <aside className="inmotrack-sidebar flex flex-col" data-open={mobileOpen} data-collapsed={collapsed}>
        <div className="sidebar-brand flex min-h-[104px] items-center gap-3 border-b border-border px-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- Identidad SVG local */}
          <img src="/logo-macchieraldo-villarruel-icon.svg" alt="" className="size-12 shrink-0 object-contain" />
          <div className="sidebar-brand-name min-w-0">
            <p className="font-heading text-[13px] font-bold leading-tight text-foreground">Macchieraldo</p>
            <p className="font-heading text-[13px] font-bold leading-tight text-foreground">Villarruel</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[1px] text-muted-foreground">Inmobiliaria</p>
          </div>
          <button type="button" onClick={() => setMobileOpen(false)} className="inmotrack-mobile-only ml-auto text-muted-foreground" aria-label="Cerrar menú">
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <DashboardNav onNavigate={() => setMobileOpen(false)} showTestClock={showTestClock} />
        <div className="border-t border-border p-3">
          <div className="sidebar-label mb-3 flex items-center gap-2 px-2 pt-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted font-heading text-xs font-bold">{initial}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold">{email}</p>
              <p className="text-[10px] font-semibold uppercase tracking-[1px] text-muted-foreground">{rol}</p>
            </div>
          </div>
          <form action={onLogout}>
            <Button type="submit" variant="ghost" size="sm" title="Cerrar sesión" className="w-full justify-start gap-2 text-muted-foreground">
              <LogOut aria-hidden className="size-4" />
              <span className="sidebar-label">Cerrar sesión</span>
            </Button>
          </form>
          <button type="button" onClick={toggleCollapsed}
            aria-label={collapsed ? "Expandir barra lateral" : "Contraer barra lateral"}
            className="inmotrack-desktop-only mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-border py-2 text-[11px] text-muted-foreground hover:bg-muted">
            {collapsed ? <PanelLeftOpen aria-hidden className="size-4" /> : <PanelLeftClose aria-hidden className="size-4" />}
            {!collapsed && "Contraer"}
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="inmotrack-topbar flex items-center justify-between gap-4 px-4 sm:px-8">
          <div className="inmotrack-desktop-only min-w-0 items-center gap-2 text-[12px] text-muted-foreground sm:flex">
            <span>InmoTrack</span><span aria-hidden>/</span><strong className="font-semibold text-foreground">{pageName}</strong>
          </div>
          <div className="inmotrack-mobile-only flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setMobileOpen(true)} aria-label="Abrir menú" className="rounded-md p-2 text-foreground">
              <Menu aria-hidden className="size-5" />
            </button>
            <span className="truncate font-heading text-[14px] font-bold">InmoTrack</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="inmotrack-desktop-only text-[10px] font-semibold uppercase tracking-[1px] text-muted-foreground">{rol}</span>
            <span className="flex size-9 items-center justify-center rounded-full border border-border bg-muted font-heading text-[12px] font-bold" title={email} aria-label={email}>{initial}</span>
          </div>
        </header>
        <main id="contenido-principal" className="flex-1">
          <div className="inmotrack-main">{children}</div>
        </main>
      </div>
      <nav className="inmotrack-mobile-bottom" aria-label="Navegación inferior">
        {NAV_ITEMS.filter((item) => MOBILE_HREFS.includes(item.href)).map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={cn("flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 text-[9px] font-semibold", active ? "text-primary" : "text-muted-foreground")}>
            <Icon aria-hidden className="size-[19px]" strokeWidth={1.8} /><span className="truncate">{label}</span>
          </Link>;
        })}
      </nav>
    </div>
  );
}
