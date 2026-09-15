import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { LiquidacionesService } from "@/services/liquidaciones.service";
import { PageHeader } from "@/components/layout/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { BadgeEstadoLiquidacion } from "@/components/features/liquidaciones/BadgeEstadoLiquidacion";
import { DetalleLiquidacion } from "@/components/features/liquidaciones/DetalleLiquidacion";
import { BotonImprimirLiquidacion } from "@/components/features/liquidaciones/BotonImprimirLiquidacion";
import { formatFechaLocal } from "@/lib/fecha";

export default async function LiquidacionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const idLiquidacion = Number(id);
  if (!Number.isInteger(idLiquidacion) || idLiquidacion <= 0) notFound();

  const liquidacion = await LiquidacionesService.obtenerDetalle(idLiquidacion);
  if (!liquidacion) notFound();

  return (
    <div className="liquidacion-print">
      <PageHeader
        eyebrow={`Liquidación #${liquidacion.id}`}
        title={liquidacion.propietario.nombre}
        description={`Período liquidado: ${formatFechaLocal(liquidacion.fecha_desde)} al ${formatFechaLocal(liquidacion.fecha_hasta)}`}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
            <BotonImprimirLiquidacion />
            <Link
              href="/liquidaciones"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <ArrowLeft aria-hidden className="size-4" />
              Volver a liquidaciones
            </Link>
          </div>
        }
      />

      <div className="-mt-5 mb-8 flex items-center gap-2 text-sm text-muted-foreground">
        <span>Estado</span>
        <BadgeEstadoLiquidacion estado={liquidacion.estado} />
      </div>

      <DetalleLiquidacion liquidacion={liquidacion} />
    </div>
  );
}
