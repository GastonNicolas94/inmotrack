"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { imprimirDetalle } from "@/lib/liquidacion-detalle";

export function BotonImprimirLiquidacion() {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => imprimirDetalle(() => window.print())}
    >
      <Printer aria-hidden className="size-4" />
      Imprimir detalle
    </Button>
  );
}
