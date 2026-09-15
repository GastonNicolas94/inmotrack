import { Decimal } from "@prisma/client/runtime/client";
import type { LiquidacionDetalle } from "@/services/liquidaciones.service";
import { formatFechaLocal } from "@/lib/fecha";
import {
  calcularDesgloseLiquidacion,
  calcularPorcentajeComision,
} from "@/lib/liquidacion-detalle";
import { etiquetaTipoCargo } from "@/lib/cargos";
import { fmt } from "@/components/features/shared/PeriodoResumenRow";
import { EstadoBadge } from "@/components/features/shared/EstadoBadge";
import { TableCard } from "@/components/layout/TableCard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const COLORES_ESTADO_GASTO: Record<string, string> = {
  PENDIENTE: "bg-status-warning-bg text-status-warning",
  PAGADO_PROVEEDOR: "bg-status-success-bg text-status-success",
};

const FORMATO_FECHA_HORA = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  dateStyle: "short",
  timeStyle: "short",
});

function formatFechaHora(fecha: Date | string) {
  return FORMATO_FECHA_HORA.format(new Date(fecha));
}

export function DetalleLiquidacion({
  liquidacion,
}: {
  liquidacion: LiquidacionDetalle;
}) {
  const desglose = calcularDesgloseLiquidacion(liquidacion);
  const itemsAlquiler = liquidacion.items.filter((item) => item.id_periodo !== null);
  const gastos = liquidacion.items.flatMap((item) =>
    item.gastos_item.map((gasto) => ({ gasto, propiedad: item.propiedad }))
  );

  const resumen = [
    { label: "Bruto cobrado", monto: liquidacion.monto_bruto },
    { label: "Comisión", monto: desglose.comisiones },
    { label: "Gastos", monto: desglose.gastos },
    { label: "Adelantos", monto: desglose.adelantos },
    { label: "Neto a pagar", monto: liquidacion.monto_neto, destacado: true },
  ];

  return (
    <div className="space-y-10">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {resumen.map((item) => (
          <div
            key={item.label}
            className={`rounded-2xl border border-border bg-card p-4 ${
              item.destacado ? "ring-1 ring-primary/25" : ""
            }`}
          >
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {item.label}
            </p>
            <p className="mt-2 font-mono text-xl font-semibold">{fmt(item.monto.toString())}</p>
          </div>
        ))}
      </div>

      {!desglose.consistente && (
        <div
          role="alert"
          className="rounded-xl bg-status-danger-bg px-4 py-3 text-sm text-status-danger"
        >
          El detalle no reconcilia con los totales guardados de la liquidación.
        </div>
      )}

      <section aria-labelledby="alquileres-liquidacion" className="space-y-4">
        <div>
          <h2 id="alquileres-liquidacion" className="font-heading text-2xl font-semibold">
            Alquileres cobrados
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cargos de alquiler y cobros efectivamente incluidos en esta liquidación.
          </p>
        </div>
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Propiedad</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Inquilino</TableHead>
                <TableHead>Cargos y cobros</TableHead>
                <TableHead className="text-right">Bruto</TableHead>
                <TableHead className="text-right">Comisión</TableHead>
                <TableHead className="text-right">Neto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itemsAlquiler.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    Esta liquidación no incluyó cobros de alquiler.
                  </TableCell>
                </TableRow>
              ) : (
                itemsAlquiler.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.propiedad.direccion}</TableCell>
                    <TableCell className="font-mono text-sm">{item.periodo?.periodo ?? "—"}</TableCell>
                    <TableCell>{item.periodo?.contrato.inquilino.nombre ?? "—"}</TableCell>
                    <TableCell className="min-w-64 whitespace-normal">
                      <div className="space-y-2">
                        {item.aplicaciones.map((aplicacion) => (
                          <div key={aplicacion.id} className="text-sm">
                            <p className="font-medium">
                              Cargo #{aplicacion.cargo.id} · {etiquetaTipoCargo(aplicacion.cargo.tipo)}
                              {aplicacion.cargo.descripcion
                                ? ` — ${aplicacion.cargo.descripcion}`
                                : ""}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Transacción #{aplicacion.transaccion.id} ·{" "}
                              {formatFechaHora(aplicacion.transaccion.fecha_transaccion)} ·{" "}
                              {fmt(aplicacion.monto_aplicado.toString())}
                            </p>
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmt(item.monto_bruto.toString())}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      <span className="block">{fmt(item.comision.toString())}</span>
                      <span className="text-xs">
                        {calcularPorcentajeComision(item.monto_bruto, item.comision).toFixed(2)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">
                      {fmt(item.monto_neto.toString())}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableCard>
      </section>

      <section aria-labelledby="gastos-liquidacion" className="space-y-4">
        <div>
          <h2 id="gastos-liquidacion" className="font-heading text-2xl font-semibold">
            Gastos descontados
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Gastos a cargo del propietario incluidos como deducción.
          </p>
        </div>
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Propiedad</TableHead>
                <TableHead>Gasto</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-center">Estado</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {gastos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Esta liquidación no incluyó gastos.
                  </TableCell>
                </TableRow>
              ) : (
                gastos.map(({ gasto, propiedad }) => (
                  <TableRow key={gasto.id}>
                    <TableCell className="font-medium">{propiedad.direccion}</TableCell>
                    <TableCell>
                      <span className="font-medium">Gasto #{gasto.id} — {gasto.concepto}</span>
                      <span className="block text-xs text-muted-foreground">
                        {gasto.tipo.replaceAll("_", " ")}
                        {gasto.categoria_interno ? ` · ${gasto.categoria_interno}` : ""}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatFechaHora(gasto.creado_en)}
                    </TableCell>
                    <TableCell className="text-center">
                      <EstadoBadge valor={gasto.estado_pago} colores={COLORES_ESTADO_GASTO} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmt(gasto.monto.toString())}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableCard>
      </section>

      <section aria-labelledby="adelantos-liquidacion" className="space-y-4">
        <div>
          <h2 id="adelantos-liquidacion" className="font-heading text-2xl font-semibold">
            Adelantos descontados
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Adelantos previos recuperados en esta liquidación.
          </p>
        </div>
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Adelanto</TableHead>
                <TableHead>Fecha original</TableHead>
                <TableHead className="text-right">Monto original</TableHead>
                <TableHead className="text-right">Descontado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {liquidacion.deducciones.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Esta liquidación no descontó adelantos.
                  </TableCell>
                </TableRow>
              ) : (
                liquidacion.deducciones.map((deduccion) => (
                  <TableRow key={deduccion.id}>
                    <TableCell>
                      <span className="font-medium">
                        {deduccion.transaccion.comentario || `Adelanto #${deduccion.transaccion.id}`}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Transacción #{deduccion.transaccion.id}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatFechaHora(deduccion.transaccion.fecha_transaccion)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmt(new Decimal(deduccion.transaccion.monto).abs().toString())}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">
                      {fmt(deduccion.monto_descontado.toString())}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableCard>
      </section>

      <div className="rounded-2xl border border-border bg-card p-5 text-right">
        <p className="text-sm text-muted-foreground">
          {fmt(liquidacion.monto_bruto.toString())} − {fmt(desglose.comisiones.toString())} −{" "}
          {fmt(desglose.gastos.toString())} − {fmt(desglose.adelantos.toString())}
        </p>
        <p className="mt-1 font-mono text-2xl font-semibold">
          Neto a pagar: {fmt(liquidacion.monto_neto.toString())}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Período: {formatFechaLocal(liquidacion.fecha_desde)} al{" "}
          {formatFechaLocal(liquidacion.fecha_hasta)}
        </p>
      </div>
    </div>
  );
}
