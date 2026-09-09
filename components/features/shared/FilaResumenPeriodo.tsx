import { BadgeEstadoPeriodo } from "./BadgeEstadoPeriodo";
import { fmt } from "./PeriodoResumenRow";
import { formatFechaLocal } from "@/lib/fecha";

/**
 * Fila de resumen de UN período completo (no de un Cargo puntual): estado
 * agregado, saldo pendiente total y vencimiento. Click → detalle Cargo por
 * Cargo de ese período. Compartido entre contratos e inquilinos.
 */
export function FilaResumenPeriodo({
  periodo,
  estado,
  saldoPendiente,
  fechaVencimiento,
  onClick,
}: {
  periodo: string;
  estado: string;
  saldoPendiente: number | string;
  fechaVencimiento: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-xl border border-border px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted"
    >
      <div className="flex items-center gap-2">
        <span className="font-mono font-medium">{periodo}</span>
        <BadgeEstadoPeriodo estado={estado} />
      </div>
      <div className="space-y-0.5 text-right text-xs">
        {Number(saldoPendiente) > 0 ? (
          <div className="font-semibold text-status-danger">
            Debe: <span className="font-mono">{fmt(saldoPendiente)}</span>
          </div>
        ) : (
          <div className="text-status-success">Cobrado</div>
        )}
        <div className="text-muted-foreground">
          Vence: {formatFechaLocal(fechaVencimiento)}
        </div>
      </div>
    </button>
  );
}
