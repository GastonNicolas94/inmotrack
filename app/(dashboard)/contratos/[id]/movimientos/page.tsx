import { Suspense } from "react";
import Link from "next/link";
import { TableLoadingSkeleton } from "@/components/layout/TableLoadingSkeleton";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ContratosService } from "@/services/contratos.service";
import { PageHeader } from "@/components/layout/PageHeader";
import { TableCard } from "@/components/layout/TableCard";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { BadgeTipoTransaccion } from "@/components/features/transacciones/BadgeTipoTransaccion";
import { FiltroRangoFecha } from "@/components/features/shared/FiltroRangoFecha";
import { fmt } from "@/components/features/shared/PeriodoResumenRow";
import { etiquetaTipoCargo } from "@/lib/cargos";


export default async function MovimientosContratoPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const [{ id }, { desde, hasta }] = await Promise.all([params, searchParams]);
  const contratoId = Number(id);
  if (!Number.isSafeInteger(contratoId) || contratoId <= 0) notFound();
  return <Suspense fallback={<div>
    <PageHeader eyebrow="Libro mayor del contrato" title="Movimientos del contrato"
      description="Consultando cargos, cobros y saldos…"
      action={<Link href="/contratos" className={buttonVariants({ variant: "outline", size: "sm" })}>
        <ArrowLeft className="size-4" /> Volver a contratos
      </Link>} />
    <TableLoadingSkeleton />
  </div>}>
    <MovimientosContratoContenido id={contratoId} desde={desde} hasta={hasta} />
  </Suspense>;
}

async function MovimientosContratoContenido({
  id, desde, hasta,
}: { id: number; desde?: string; hasta?: string }) {
  const detalle = await ContratosService.obtenerMovimientosContrato(id, {
    desde: desde ? new Date(desde) : undefined,
    hasta: hasta ? new Date(hasta) : undefined,
  });
  if (!detalle) notFound();
  const { contrato, movimientos } = detalle;

  return (
    <div>
      <PageHeader
        eyebrow="Libro mayor del contrato"
        title={contrato.propiedad.direccion}
        description={contrato.inquilino.nombre}
        action={
          <Link href="/contratos" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ArrowLeft className="size-4" /> Volver a contratos
          </Link>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <FiltroRangoFecha />
      </div>

      <TableCard key={`${id}:${desde ?? ""}:${hasta ?? ""}`}>
        <Table className="inmotrack-card-table" data-kind="movimientos-contrato">
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Concepto</TableHead>
              <TableHead className="text-right">Debe</TableHead>
              <TableHead className="text-right">Haber</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead>Usuario</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movimientos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Este contrato no tiene movimientos todavía.
                </TableCell>
              </TableRow>
            ) : (
              movimientos.map((m, i) => (
                <TableRow key={i}>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(m.fecha).toLocaleString("es-AR")}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.periodo}</TableCell>
                  <TableCell>
                    {m.esCargo ? (
                      <span className="font-medium">
                        {etiquetaTipoCargo(m.tipo)}
                        {m.descripcion ? ` — ${m.descripcion}` : ""}
                      </span>
                    ) : (
                      <BadgeTipoTransaccion tipo={m.tipo} />
                    )}
                  </TableCell>
                  <TableCell className="text-right font-heading tabular-nums text-sm">
                    {Number(m.debe) > 0 ? fmt(m.debe.toString()) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-heading tabular-nums text-sm text-foreground">
                    {Number(m.haber) !== 0 ? fmt(m.haber.toString()) : "—"}
                  </TableCell>
                  <TableCell
                    className={`text-right font-heading tabular-nums text-sm font-semibold ${
                      Number(m.saldo) > 0 ? "text-foreground" : "text-status-success"
                    }`}
                  >
                    {fmt(m.saldo.toString())}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {m.usuario ?? (m.esCargo ? "—" : "Sistema")}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableCard>
    </div>
  );
}
