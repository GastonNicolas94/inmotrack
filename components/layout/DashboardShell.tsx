"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "inmotrack:sidebar-collapsed";

export function DashboardShell({
  email,
  rol,
  onLogout,
  children,
}: {
  email: string;
  rol?: string;
  onLogout: () => void;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Restaurar preferencia de colapso (desktop) — después del mount, para no romper el HTML del servidor.
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === "1") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Backdrop del drawer en mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar: drawer deslizable en mobile, columna estática y colapsable en desktop */}
      <aside
        data-collapsed={collapsed}
        className={cn(
          "group/aside fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-sidebar transition-transform duration-200 ease-in-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "md:static md:z-auto md:translate-x-0 md:transition-[width]",
          collapsed ? "md:w-[72px]" : "md:w-64"
        )}
      >
        <div className="relative flex items-center justify-center px-5 py-6 md:group-data-[collapsed=true]/aside:px-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG: next/image bloquea SVG local por defecto */}
          <img
            src="/logo-macchieraldo-villarruel-icon.svg"
            alt="Macchieraldo Villarruel"
            className="size-24 shrink-0 object-contain md:group-data-[collapsed=true]/aside:size-10"
          />
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground md:hidden"
          >
            <X className="size-5" />
          </button>
        </div>

        <DashboardNav onNavigate={() => setMobileOpen(false)} />

        <div className="space-y-3 border-t border-border p-4 md:group-data-[collapsed=true]/aside:px-2">
          <div className="flex items-center justify-between gap-2 md:group-data-[collapsed=true]/aside:hidden">
            <p className="truncate text-sm text-foreground/80">{email}</p>
            {rol && (
              <Badge variant="secondary" className="shrink-0 uppercase">
                {rol}
              </Badge>
            )}
          </div>
          <form action={onLogout}>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              type="submit"
              title="Cerrar sesión"
            >
              <LogOut className="size-4 shrink-0" />
              <span className="md:group-data-[collapsed=true]/aside:hidden">
                Cerrar sesión
              </span>
            </Button>
          </form>
        </div>

        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expandir barra lateral" : "Contraer barra lateral"}
          className="mx-3 mb-4 hidden items-center justify-center gap-2 rounded-lg border border-border py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header mobile: solo botón de menú, visible por debajo de md */}
        <header className="relative flex items-center justify-center border-b border-border px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú"
            className="absolute left-4 text-foreground"
          >
            <Menu className="size-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG: next/image bloquea SVG local por defecto */}
          <img
            src="/logo-macchieraldo-villarruel-icon.svg"
            alt="Macchieraldo Villarruel"
            className="size-11 shrink-0 object-contain"
          />
        </header>

        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl px-6 py-8 md:px-8 md:py-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
