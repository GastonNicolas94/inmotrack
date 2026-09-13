"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileText, Building2, UserRound, Users,
  Wallet, Receipt, HandCoins, BookText, LayoutDashboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NavLinkPendingIndicator } from "@/components/layout/NavLinkPendingIndicator";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/contratos", label: "Contratos", icon: FileText },
  { href: "/propietarios", label: "Propietarios", icon: Users },
  { href: "/propiedades", label: "Propiedades", icon: Building2 },
  { href: "/inquilinos", label: "Inquilinos", icon: UserRound },
  { href: "/pagos", label: "Pagos", icon: Wallet },
  { href: "/gastos", label: "Gastos", icon: Receipt },
  { href: "/liquidaciones", label: "Liquidaciones", icon: HandCoins },
  { href: "/transacciones", label: "Libro Diario", icon: BookText },
];

export function DashboardNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-0.5 p-3">
      {NAV_ITEMS.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            title={item.label}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors md:group-data-[collapsed=true]/aside:justify-center md:group-data-[collapsed=true]/aside:px-0",
              active
                ? "bg-primary/10 text-primary"
                : "text-foreground/80 hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" strokeWidth={2} />
            <span className="md:group-data-[collapsed=true]/aside:hidden">
              {item.label}
            </span>
            <NavLinkPendingIndicator />
          </Link>
        );
      })}
    </nav>
  );
}
