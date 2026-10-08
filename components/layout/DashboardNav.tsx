"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Building2, UserRound, Users, Wallet, Receipt, HandCoins, BookText, LayoutDashboard, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { NavLinkPendingIndicator } from "@/components/layout/NavLinkPendingIndicator";

export const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/contratos", label: "Contratos", icon: FileText },
  { href: "/propietarios", label: "Propietarios", icon: Users },
  { href: "/propiedades", label: "Propiedades", icon: Building2 },
  { href: "/inquilinos", label: "Inquilinos", icon: UserRound },
  { href: "/pagos", label: "Pagos", icon: Wallet },
  { href: "/gastos", label: "Gastos", icon: Receipt },
  { href: "/liquidaciones", label: "Liquidaciones", icon: HandCoins },
  { href: "/transacciones", label: "Libro Diario", icon: BookText },
] as const;

export function DashboardNav({ onNavigate, showTestClock = false }: { onNavigate?: () => void; showTestClock?: boolean }) {
  const pathname = usePathname();
  const items = showTestClock
    ? [...NAV_ITEMS, { href: "/dev/reloj", label: "Reloj de pruebas", icon: Clock3 }]
    : NAV_ITEMS;

  return (
    <nav aria-label="Menú principal" className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
      <p className="sidebar-label mb-3 px-3 text-[10px] font-bold uppercase tracking-[1.3px] text-muted-foreground">Navegación</p>
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname?.startsWith(href);
        return (
          <Link key={href} href={href} onClick={onNavigate} title={label} aria-current={active ? "page" : undefined}
            className={cn("sidebar-link flex min-h-10 items-center gap-3 rounded-[6px] px-3 py-2 text-[12px] font-semibold transition-colors duration-200",
              active ? "bg-brand-soft text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            <Icon aria-hidden className={cn("size-[18px] shrink-0", active && "text-primary")} strokeWidth={1.8} />
            <span className="sidebar-label flex-1">{label}</span>
            <NavLinkPendingIndicator />
          </Link>
        );
      })}
    </nav>
  );
}
