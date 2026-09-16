import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CalendarClock, Receipt, RefreshCcw, WalletCards } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DashboardEmptyState } from "@/components/features/dashboard/DashboardStates";
import { formatFechaLocal } from "@/lib/fecha";
import type { DashboardAlert, DashboardAlertKind } from "@/lib/dashboard/types";

const KIND_LABEL: Record<DashboardAlertKind, string> = {
  "ajuste-pendiente": "Ajuste",
  "contrato-por-vencer": "Contrato",
  "deuda-vencida": "Deuda",
  "gasto-pendiente": "Gasto",
  "liquidacion-pendiente": "Liquidación",
};
const KIND_ICON: Record<DashboardAlertKind, typeof AlertTriangle> = {
  "ajuste-pendiente": RefreshCcw,
  "contrato-por-vencer": CalendarClock,
  "deuda-vencida": WalletCards,
  "gasto-pendiente": Receipt,
  "liquidacion-pendiente": AlertTriangle,
};

export function OperationalAlerts({ alerts }: { alerts: DashboardAlert[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Alertas operativas</CardTitle>
        <Badge variant={alerts.length ? "destructive" : "secondary"}>{alerts.length}</Badge>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? <DashboardEmptyState title="Todo en orden" description="No hay alertas pendientes para los filtros seleccionados." /> : (
          <ul className="divide-y divide-border">
            {alerts.map((alert) => {
              const Icon = KIND_ICON[alert.kind];
              const detail = KIND_LABEL[alert.kind]
                + (alert.amount ? " · " + alert.amount : "")
                + (alert.dueDate ? " · vence " + formatFechaLocal(alert.dueDate) : "");
              return (
                <li key={alert.kind + "-" + alert.id}>
                  <Link href={alert.href} className="group flex items-start gap-3 py-3 first:pt-0 last:pb-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-foreground group-hover:text-primary">{alert.title}</span>
                      {alert.description ? <span className="mt-0.5 block text-sm text-muted-foreground">{alert.description}</span> : null}
                      <span className="mt-1 block text-xs text-muted-foreground">{detail}</span>
                    </span>
                    <ArrowUpRight aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
