import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export function BotonDescargarPdfLiquidacion({ id }: { id: number }) {
  return (
    <a
      href={`/api/v1/liquidaciones/${id}/pdf`}
      className={buttonVariants({ variant: "outline", size: "sm" })}
    >
      <Download aria-hidden className="size-4" />
      Descargar PDF
    </a>
  );
}
