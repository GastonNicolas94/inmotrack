"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenText, Building2, Clock3, FileText, HandCoins, LayoutDashboard,
  Receipt, UserRound, Users, Wallet,
} from "lucide-react";
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
  { href: "/transacciones", label: "Libro Diario", icon: BookOpenText },
] as const;

const GROUPS = [
  { heading: "GENERAL", hrefs: ["/"] },
  { heading: "GESTIÓN", hrefs: ["/contratos", "/propiedades", "/propietarios", "/inquilinos"] },
  { heading: "FINANZAS", hrefs: ["/pagos", "/gastos", "/liquidaciones", "/transacciones"] },
] as const;

export function DashboardNav({
  onNavigate,
  showTestClock = false,
}: {
  onNavigate?: () => void;
  showTestClock?: boolean;
}) {
  const pathname = usePathname();

  function navLink(item: { href: string; label: string; icon: typeof LayoutDashboard }) {
    const active = item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        title={item.label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "sidebar-link group/link relative flex min-h-[38px] items-center gap-3 rounded-md px-3 text-[12px] font-medium transition-colors duration-200",
          active
            ? "bg-brand-soft font-semibold text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        {active && <span aria-hidden="true" className="absolute inset-y-[9px] left-0 w-[3px] rounded-r bg-primary" />}
        <Icon aria-hidden className={cn("size-[17px] shrink-0", active && "text-primary")} strokeWidth={1.8} />
        <span className="sidebar-label flex-1 whitespace-nowrap">{item.label}</span>
        <NavLinkPendingIndicator />
      </Link>
    );
  }

  return (
    <nav aria-label="Menú principal" className="sidebar-nav min-h-0 flex-1 overflow-y-auto px-3 py-4">
      {GROUPS.map((group, index) => (
        <div key={group.heading} className={cn("sidebar-nav-section", index > 0 && "mt-4")}>
          <p className="sidebar-label mb-1.5 px-3 text-[9px] font-bold tracking-[1.3px] text-muted-foreground">
            {group.heading}
          </p>
          <div className="space-y-0.5">
            {group.hrefs.map((href) => {
              const item = NAV_ITEMS.find((entry) => entry.href === href);
              return item ? navLink(item) : null;
            })}
          </div>
        </div>
      ))}
      {showTestClock ? (
        <div className="sidebar-nav-section mt-4">
          <p className="sidebar-label mb-1.5 px-3 text-[9px] font-bold tracking-[1.3px] text-muted-foreground">
            HERRAMIENTAS
          </p>
          {navLink({ href: "/dev/reloj", label: "Reloj de pruebas", icon: Clock3 })}
        </div>
      ) : null}
    </nav>
  );
}
