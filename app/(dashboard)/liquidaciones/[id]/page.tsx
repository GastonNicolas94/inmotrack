import { Suspense } from "react";
import Link from "next/link";
import { TableLoadingSkeleton } from "@/components/layout/TableLoadingSkeleton";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { LiquidacionesService } from "@/services/liquidaciones.service";
import { PageHeader } from "@/components/layout/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { BadgeEstadoLiquidacion } from "@/components/features/liquidaciones/BadgeEstadoLiquidacion";
import { DetalleLiquidacion } from "@/components/features/liquidaciones/DetalleLiquidacion";
import { BotonDescargarPdfLiquidacion } from "@/components/features/liquidaciones/BotonDescargarPdfLiquidacion";
import { formatFechaLocal } from "@/lib/fecha";

export default async function LiquidacionDetallePage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idLiquidacion = Number(id);
  if (!Number.isSafeInteger(idLiquidacion) || idLiquidacion <= 0) notFound();
  return <Suspense fallback={<div>
    <PageHeader eyebrow={`Liquidación #${idLiquidacion}`} title="Detalle de liquidación"
      description="Consultando el desglose de la liquidación…" />
    <TableLoadingSkeleton />
  </div>}>
    <LiquidacionDetalleContenido idLiquidacion={idLiquidacion} />
  </Suspense>;
}

async function LiquidacionDetalleContenido({ idLiquidacion }: { idLiquidacion: number }) {
  const liquidacion = await LiquidacionesService.obtenerDetalle(idLiquidacion);
  if (!liquidacion) notFound();

  return (
    <div>
      <PageHeader
        eyebrow={`Liquidación #${liquidacion.id}`}
        title={liquidacion.propietario.nombre}
        description={`Período liquidado: ${formatFechaLocal(liquidacion.fecha_desde)} al ${formatFechaLocal(liquidacion.fecha_hasta)}`}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <BotonDescargarPdfLiquidacion id={liquidacion.id} />
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
