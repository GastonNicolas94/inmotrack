import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function DashboardMetricCard({ label, value, description, icon: Icon }: {
  label: string;
  value: string | number;
  description?: string;
  icon?: LucideIcon;
}) {
  return (
    <Card className="h-full justify-between gap-3">
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-0">
        <CardTitle className="font-sans text-[10px] font-extrabold uppercase tracking-[1px] text-muted-foreground sm:text-[11px]">
          {label}
        </CardTitle>
        {Icon ? <Icon aria-hidden className="size-[18px] shrink-0 text-primary" strokeWidth={1.8} /> : null}
      </CardHeader>
      <CardContent>
        <p className="inmotrack-amount break-words text-[22px] font-bold leading-tight text-foreground sm:text-[25px] 2xl:text-[30px]">{value}</p>
        {description ? <CardDescription className="mt-2 text-[11px]">{description}</CardDescription> : null}
      </CardContent>
    </Card>
  );
}
