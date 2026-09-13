"use client";

import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function DashboardMetricCard({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  description?: string;
  icon?: LucideIcon;
}) {
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        {Icon ? <Icon aria-hidden className="size-4 text-primary" /> : null}
      </CardHeader>
      <CardContent>
        <p className="font-heading text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
      </CardContent>
    </Card>
  );
}
