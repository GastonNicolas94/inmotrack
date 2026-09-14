import { BadgeEstadoPeriodo } from "./BadgeEstadoPeriodo";
import { formatFechaLocal } from "@/lib/fecha";
import { etiquetaTipoCargo } from "@/lib/cargos";

export function fmt(n: number | string | null | undefined) {
  return Number(n ?? 0).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });
}


/** Fila de resumen de un Cargo dentro de un período de pago. */
export function PeriodoResumenRow({
  periodo,
  estado,
  tipo,
  monto,
  pendiente,
  fechaVencimiento,
}: {
  periodo: string;
  estado?: string;
  tipo?: string;
  monto: number | string;
  pendiente: number | string;
  fechaVencimiento?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-mono font-medium">{periodo}</span>
        {tipo && <span className="text-xs text-muted-foreground">{etiquetaTipoCargo(tipo)}</span>}
        {estado && <BadgeEstadoPeriodo estado={estado} />}
      </div>
      <div className="space-y-0.5 text-right text-xs">
        <div className="text-muted-foreground">
          Monto: <span className="font-mono">{fmt(monto)}</span>
        </div>
        {Number(pendiente) > 0 ? (
          <div className="font-semibold text-status-danger">
            Debe: <span className="font-mono">{fmt(pendiente)}</span>
          </div>
        ) : (
          <div className="text-status-success">Cobrado</div>
        )}
        {fechaVencimiento && (
          <div className="text-xs text-muted-foreground">
            Vence: {formatFechaLocal(fechaVencimiento)}
          </div>
        )}
      </div>
    </div>
  );
}
