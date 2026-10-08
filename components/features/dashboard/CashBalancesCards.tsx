import { Landmark, Wallet } from "lucide-react";

export type CashBalances = { terceros: string; operativa: string };

const ars = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const money = (amount: string) => ars.format(Number(amount));

/** Saldos contables acumulados; no equivalen a fondos bancarios conciliados. */
export function CashBalancesCards({ balances }: { balances: CashBalances }) {
  return (
    <section aria-labelledby="cash-balances-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="cash-balances-heading" className="font-heading text-[18px] font-bold">Cajas</h2>
        <p className="text-[11px] text-muted-foreground">Saldos contables del Libro Diario · todas las propiedades</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="relative flex min-h-40 flex-col justify-between rounded-lg border border-cash-dark bg-cash-dark p-5 text-cash-dark-foreground sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <span className="text-[11px] font-bold uppercase tracking-[1.3px] text-cash-dark-muted">Caja 1 · Recaudadora de terceros</span>
            <span className="flex size-9 items-center justify-center rounded-full bg-[var(--cash-icon-bg)]"><Landmark aria-hidden className="size-[18px]" /></span>
          </div>
          <div>
            <p className="inmotrack-amount break-words text-[26px] font-bold leading-tight sm:text-[30px]">{money(balances.terceros)}</p>
            <p className="mt-2 text-[11px] text-cash-dark-muted">Movimientos acumulados de terceros</p>
          </div>
        </div>
        <div className="relative flex min-h-40 flex-col justify-between rounded-lg border border-border bg-card p-5 text-foreground sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <span className="text-[11px] font-bold uppercase tracking-[1.3px] text-muted-foreground">Caja 2 · Operativa</span>
            <span className="flex size-9 items-center justify-center rounded-full bg-muted"><Wallet aria-hidden className="size-[18px]" /></span>
          </div>
          <div>
            <p className="inmotrack-amount break-all text-[26px] font-bold leading-tight sm:text-[30px]">{money(balances.operativa)}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">Comisiones y operaciones propias</p>
          </div>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">Son saldos por caja según asientos registrados, no saldos bancarios conciliados. No se suman entre sí.</p>
    </section>
  );
}
