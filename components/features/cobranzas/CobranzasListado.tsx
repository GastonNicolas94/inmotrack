import { PaginatedItems } from "@/components/layout/ListPagination";
import Link from "next/link";
import { Search, Download } from "lucide-react";
import { CobranzasService } from "@/services/cobranzas.service";
import { requireAuthenticatedUser } from "@/lib/auth-context";
import { filtrarCobranzas, conteosCobranzas, ESTADOS_COBRANZA, type FiltroCobranza } from "@/lib/cobranzas";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableCard } from "@/components/layout/TableCard";
import { EstadoCobranza } from "./EstadoCobranza";
import { ModalRegistrarPago } from "@/components/features/pagos/ModalRegistrarPago";
import { Button } from "@/components/ui/button";

const money = (n: string) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(Number(n));
const date = (d: Date) => new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(d);

export async function CobranzasListado({ filtro, q }: { filtro: FiltroCobranza; q: string }) {
  const [rows, user] = await Promise.all([CobranzasService.listar(), requireAuthenticatedUser()]);
  const counts = conteosCobranzas(rows);
  const filtered = filtrarCobranzas(rows, filtro, q);
  const exportParams = new URLSearchParams();
  exportParams.set("estado", filtro);
  if (q) exportParams.set("q", q);
  const canWrite = user.rol !== "AUDITOR";
  const actions = (row: typeof rows[number]) =>
    canWrite && row.estado !== "COBRADO"
      ? <ModalRegistrarPago contrato={{ id: row.contratoId, inquilino: { nombre: row.inquilino }, propiedad: { direccion: row.propiedad } }} />
      : <span className="text-[11px] text-muted-foreground">—</span>;

  return <div className="space-y-4">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div className="flex max-w-full gap-1 overflow-x-auto rounded-md border border-border bg-muted p-1" aria-label="Filtrar cobranza">
        {(Object.keys(ESTADOS_COBRANZA) as FiltroCobranza[]).map((estado) => {
          const params = new URLSearchParams();
          params.set("estado", estado);
          if (q) params.set("q", q);
          return <Link key={estado} href={`/pagos?${params.toString()}`} aria-current={estado === filtro ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-[5px] px-3 py-2 text-[11px] font-semibold transition-colors ${estado === filtro ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {ESTADOS_COBRANZA[estado]}
            <span className="rounded bg-background px-1.5 py-0.5 text-[10px] tabular-nums">{counts[estado]}</span>
          </Link>;
        })}
      </div>
      <a href={`/api/v1/cobranzas/export?${exportParams.toString()}`} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-[12px] font-semibold hover:bg-muted">
        <Download aria-hidden="true" className="size-4" /> Exportar CSV
      </a>
    </div>
    <form method="get" className="flex items-center gap-2">
      <input name="estado" value={filtro} type="hidden" />
      <label htmlFor="buscar-cobranza" className="relative block w-full max-w-[420px]">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <span className="sr-only">Buscar por inquilino, propiedad, contrato o período</span>
        <input id="buscar-cobranza" name="q" defaultValue={q} placeholder="Buscar inquilino, propiedad o período"
          className="h-10 w-full rounded-md border border-input bg-card pl-9 pr-3 text-[12px] focus-visible:outline-2 focus-visible:outline-primary" />
      </label>
      <Button type="submit" variant="outline" className="h-10">Buscar</Button>
    </form>
    <p className="text-[11px] text-muted-foreground">{filtered.length} período{filtered.length === 1 ? "" : "s"} encontrado{filtered.length === 1 ? "" : "s"}. Los importes incluyen todos los cargos del período y sus aplicaciones.</p>
    <TableCard key={`${filtro}:${q}`}>
      <div className="inmotrack-desktop-only">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Inquilino / propiedad</TableHead><TableHead>Período</TableHead><TableHead>Vence</TableHead>
            <TableHead>Estado</TableHead><TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Pendiente</TableHead><TableHead className="text-right">Acciones</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 ? <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No hay períodos para los filtros seleccionados.</TableCell></TableRow> :
              filtered.map((row) => <TableRow key={row.id}>
                <TableCell><p className="font-semibold">{row.inquilino}</p><p className="mt-1 text-[11px] text-muted-foreground">{row.propiedad}</p></TableCell>
                <TableCell className="tabular-nums">{row.periodo}</TableCell>
                <TableCell className="text-muted-foreground">{date(row.vencimiento)}</TableCell>
                <TableCell><EstadoCobranza estado={row.estado} /></TableCell>
                <TableCell className="inmotrack-amount text-right">{money(row.total)}</TableCell>
                <TableCell className="inmotrack-amount text-right">{money(row.pendiente)}</TableCell>
                <TableCell className="text-right">{actions(row)}</TableCell>
              </TableRow>)
            }
          </TableBody>
        </Table>
      </div>
      <div className="inmotrack-mobile-only">
        {filtered.length === 0 ? <p className="p-8 text-center text-muted-foreground">No hay períodos para los filtros seleccionados.</p> :
          <PaginatedItems className="divide-y divide-border">
            {filtered.map((row) => <li key={row.id} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="font-semibold">{row.inquilino}</p><p className="mt-1 text-[11px] text-muted-foreground">{row.propiedad}</p></div>
                <p className="inmotrack-amount shrink-0 text-[16px] font-bold">{money(row.pendiente)}</p>
              </div>
              <div className="flex items-center justify-between gap-2"><EstadoCobranza estado={row.estado} /><span className="text-[11px] text-muted-foreground">{row.periodo} · vence {date(row.vencimiento)}</span></div>
              {canWrite && row.estado !== "COBRADO" ? <div className="[&_[data-slot=button]]:min-h-11 [&_[data-slot=button]]:w-full">{actions(row)}</div> : null}
            </li>)}
          </PaginatedItems>
        }
      </div>
    </TableCard>
  </div>;
}
