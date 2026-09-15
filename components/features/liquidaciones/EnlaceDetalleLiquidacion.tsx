import Link from "next/link";
import { Eye } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { hrefDetalleLiquidacion } from "@/lib/liquidacion-detalle";

export function EnlaceDetalleLiquidacion({ id }: { id: number }) {
  return (
    <Link
      href={hrefDetalleLiquidacion(id)}
      aria-label={`Ver detalle de la liquidación ${id}`}
      className={buttonVariants({ variant: "ghost", size: "sm" })}
    >
      <Eye aria-hidden className="size-4" />
      Ver detalle
    </Link>
  );
}
