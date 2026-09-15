import Link from "next/link";
import { Eye } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export function EnlaceDetalleLiquidacion({ id }: { id: number }) {
  return (
    <Link
      href={`/liquidaciones/${id}`}
      aria-label={`Ver detalle de la liquidación ${id}`}
      className={buttonVariants({ variant: "ghost", size: "sm" })}
    >
      <Eye aria-hidden className="size-4" />
      Ver detalle
    </Link>
  );
}
