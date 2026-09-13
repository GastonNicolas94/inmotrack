import Link from "next/link";
import { ArrowUpRight, FilePlus2, Receipt, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const ACTIONS = [
  { href: "/pagos", label: "Registrar pago", icon: Wallet },
  { href: "/gastos", label: "Cargar gasto", icon: Receipt },
  { href: "/contratos", label: "Nuevo contrato", icon: FilePlus2 },
] as const;

export function DashboardQuickActions() {
  return (
    <Card>
      <CardHeader><CardTitle>Acciones rápidas</CardTitle></CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-3">
        {ACTIONS.map(({ href, label, icon: Icon }) => (
          <Button key={href} render={<Link href={href} />} variant="outline" className="justify-between">
            <span className="flex items-center gap-2"><Icon aria-hidden className="size-4" />{label}</span>
            <ArrowUpRight aria-hidden className="size-4" />
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
