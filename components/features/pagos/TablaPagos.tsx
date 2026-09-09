import { PagosService } from "@/services/pagos.service";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TableCard } from "@/components/layout/TableCard";

function formatFecha(fecha: Date) {
  return new Date(fecha).toLocaleString("es-AR");
}

function formatMonto(n: string) {
  return Number(n).toLocaleString("es-AR", {
    style: "currency", currency: "ARS", maximumFractionDigits: 0,
  });
}

export async function TablaPagos() {
  const pagos = await PagosService.listarRecientes();

  return (
    <TableCard>
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
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No hay pagos registrados todavía.
              </TableCell>
            </TableRow>
          ) : (
            pagos.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="text-sm text-muted-foreground">{formatFecha(p.fecha)}</TableCell>
                <TableCell>{p.inquilino ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{p.direccion ?? "—"}</TableCell>
                <TableCell className="font-mono text-sm">{p.periodo ?? "—"}</TableCell>
                <TableCell className="text-right font-mono text-sm">{formatMonto(p.monto)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableCard>
  );
}
