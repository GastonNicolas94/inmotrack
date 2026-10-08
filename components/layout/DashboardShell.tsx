"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Building2, ChevronLeft, ChevronRight, LogOut, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardNav, NAV_ITEMS } from "@/components/layout/DashboardNav";
import { cn } from "@/lib/utils";
import type { AuthenticatedUser } from "@/lib/auth-context";

const STORAGE_KEY = "inmotrack:sidebar-collapsed";
const MOBILE_HREFS = ["/", "/contratos", "/pagos", "/propiedades", "/liquidaciones"];

export function DashboardShell({
  email, rol, onLogout, showTestClock, children,
}: {
  email: string;
  rol: AuthenticatedUser["rol"];
  onLogout: (formData: FormData) => void | Promise<void>;
  showTestClock?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const openMenuRef = useRef<HTMLButtonElement>(null);
  const closeMenuRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (localStorage.getItem(STORAGE_KEY) === "1") setCollapsed(true);
  }, []);

  useEffect(() => {
    // Close the drawer when a route changes (including back/forward).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeMenuRef.current?.focus();
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        openMenuRef.current?.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileOpen]);

  const pageName = NAV_ITEMS.find((item) => item.href === pathname)?.label
    ?? NAV_ITEMS.find((item) => item.href !== "/" && pathname.startsWith(item.href))?.label
    ?? (pathname.startsWith("/dev/") ? "Reloj de pruebas" : "InmoTrack");
  const initial = email.trim().charAt(0).toUpperCase() || "U";

  function closeMenu() {
    setMobileOpen(false);
    openMenuRef.current?.focus();
  }

  function toggleCollapsed() {
    setCollapsed((previous) => {
      const next = !previous;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  function keepFocusInsideDrawer(event: KeyboardEvent<HTMLElement>) {
    if (!mobileOpen || event.key !== "Tab") return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="inmotrack-shell bg-background">
      {mobileOpen ? (
        <button
          type="button"
          className="inmotrack-scrim inmotrack-mobile-only"
          aria-label="Cerrar menú lateral"
          onClick={closeMenu}
        />
      ) : null}
      <aside
        id="inmotrack-sidebar"
        className="inmotrack-sidebar flex flex-col"
        data-open={mobileOpen}
        data-collapsed={collapsed}
        role={mobileOpen ? "dialog" : undefined}
        aria-modal={mobileOpen ? true : undefined}
        aria-label="Navegación de InmoTrack"
        onKeyDown={keepFocusInsideDrawer}
      >
        <div className="sidebar-brand flex h-[76px] shrink-0 items-center gap-2.5 border-b border-border px-4">
          <Link href="/" onClick={() => setMobileOpen(false)} className="flex min-w-0 flex-1 items-center gap-2.5" title="Ir al Dashboard">
            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-primary">
              <Building2 className="size-[20px]" strokeWidth={1.8} />
            </span>
            <span className="sidebar-brand-name min-w-0">
              <span className="block truncate font-heading text-[15px] font-bold leading-tight text-foreground">InmoTrack</span>
              <span className="mt-0.5 block truncate text-[10px] font-medium text-muted-foreground">Gestión inmobiliaria</span>
            </span>
          </Link>
          <button
            ref={closeMenuRef}
            type="button"
            onClick={closeMenu}
            className="inmotrack-mobile-only inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Cerrar menú"
          >
            <X aria-hidden className="size-[18px]" />
          </button>
        </div>

        <DashboardNav onNavigate={() => setMobileOpen(false)} showTestClock={showTestClock} />

        <div className="sidebar-footer shrink-0 border-t border-border px-3 py-3">
          <div className="sidebar-account flex items-center gap-2.5 rounded-md px-2 py-1">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted font-heading text-[11px] font-bold" aria-hidden="true">{initial}</span>
            <div className="sidebar-label min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold">{email}</p>
              <p className="text-[10px] uppercase tracking-[.8px] text-muted-foreground">{rol}</p>
            </div>
          </div>
          <form action={onLogout} className="mt-2">
            <Button type="submit" variant="ghost" size="sm" title="Cerrar sesión"
              className="sidebar-logout flex min-h-9 w-full justify-start gap-3 px-3 text-[11px] text-muted-foreground hover:text-foreground">
              <LogOut aria-hidden className="size-[17px]" />
              <span className="sidebar-label">Cerrar sesión</span>
            </Button>
          </form>
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? "Expandir barra lateral" : "Contraer barra lateral"}
            aria-label={collapsed ? "Expandir barra lateral" : "Contraer barra lateral"}
            className="inmotrack-desktop-only mt-1 flex min-h-8 w-full items-center justify-center gap-2 rounded-md text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {collapsed ? <ChevronRight aria-hidden className="size-4" /> : <ChevronLeft aria-hidden className="size-4" />}
            {!collapsed && <span>Contraer menú</span>}
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="inmotrack-topbar flex items-center justify-between gap-4 px-4 sm:px-8">
          <div className="inmotrack-desktop-only min-w-0 items-center gap-2 text-[12px] text-muted-foreground sm:flex">
            <span>InmoTrack</span><span aria-hidden="true">/</span><strong className="font-semibold text-foreground">{pageName}</strong>
          </div>
          <div className="inmotrack-mobile-only flex min-w-0 items-center gap-3">
            <button
              ref={openMenuRef}
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-controls="inmotrack-sidebar"
              aria-expanded={mobileOpen}
              aria-label="Abrir menú"
              className="rounded-md p-2 text-foreground"
            >
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
        <footer className="inmotrack-desktop-only border-t border-border px-8 py-4 text-center text-[10px] text-muted-foreground">
          InmoTrack · Gestión inmobiliaria · v0.1.0
        </footer>
      </div>
      <nav className="inmotrack-mobile-bottom" aria-label="Navegación inferior">
        {NAV_ITEMS.filter((item) => MOBILE_HREFS.includes(item.href)).map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined}
              className={cn("flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 text-[9px] font-semibold", active ? "text-primary" : "text-muted-foreground")}>
              <Icon aria-hidden className="size-[19px]" strokeWidth={1.8} /><span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
