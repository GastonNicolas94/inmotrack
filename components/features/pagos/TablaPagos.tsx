import { PaginatedItems } from "@/components/layout/ListPagination";
import { PagosService } from "@/services/pagos.service";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableCard } from "@/components/layout/TableCard";

function formatFecha(fecha: Date) {
  return new Date(fecha).toLocaleString("es-AR");
}
function formatMonto(n: string) {
  return Number(n).toLocaleString("es-AR", {
    style: "currency", currency: "ARS", maximumFractionDigits: 2,
  });
}

export async function TablaPagos() {
  const pagos = await PagosService.listarRecientes(null);
  return (
    <TableCard>
      <div className="inmotrack-desktop-only">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Inquilino</TableHead>
              <TableHead>Propiedad</TableHead>
              <TableHead>Período</TableHead>
              <TableHead className="text-right">Monto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No hay pagos registrados todavía.</TableCell>
              </TableRow>
            ) : pagos.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="text-muted-foreground">{formatFecha(p.fecha)}</TableCell>
                <TableCell className="font-semibold">{p.inquilino ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{p.direccion ?? "—"}</TableCell>
                <TableCell className="tabular-nums">{p.periodo ?? "—"}</TableCell>
                <TableCell className="inmotrack-amount text-right">{formatMonto(p.monto)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="inmotrack-mobile-only">
        {pagos.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">No hay pagos registrados todavía.</p>
        ) : <PaginatedItems className="divide-y divide-border">
          {pagos.map((p) => <li key={p.id} className="flex items-start justify-between gap-3 px-4 py-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-foreground">{p.inquilino ?? "—"}</p>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">{p.direccion ?? "—"}</p>
              <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span aria-hidden className="size-1.5 rounded-full bg-muted-foreground" />
                {Number(p.monto) < 0 ? "Ajuste negativo" : "Registrado"}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="inmotrack-amount text-[14px] font-bold">{formatMonto(p.monto)}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">{formatFecha(p.fecha)}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">Período: {p.periodo ?? "—"}</p>
            </div>
          </li>)}
        </PaginatedItems>}
      </div>
    </TableCard>
  );
}
