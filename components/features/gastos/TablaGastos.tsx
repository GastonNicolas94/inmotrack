import { auth } from "@/lib/auth";
import { GastosService } from "@/services/gastos.service";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TableCard } from "@/components/layout/TableCard";
import { EstadoBadge } from "@/components/features/shared/EstadoBadge";
import { ModalCargarGasto } from "./ModalCargarGasto";
import { BotonMarcarPagado } from "./BotonMarcarPagado";

const COLORES_CARGO: Record<string, string> = {
  INQUILINO: "bg-status-warning-bg text-status-warning",
  PROPIETARIO: "bg-status-neutral-bg text-status-neutral",
  INMOBILIARIA: "bg-status-success-bg text-status-success",
};

const COLORES_ESTADO_PAGO: Record<string, string> = {
  PENDIENTE: "bg-status-neutral-bg text-status-neutral",
  PAGADO: "bg-status-success-bg text-status-success",
};

function formatMonto(n: number | string) {
  return Number(n).toLocaleString("es-AR", {
    style: "currency", currency: "ARS", maximumFractionDigits: 0,
  });
}

export async function TablaGastos() {
  const [gastos, session] = await Promise.all([
    GastosService.listar(),
    auth(),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rol = (session?.user as any)?.rol as string | undefined;
  const mostrarAcciones = rol !== "AUDITOR";

  return (
    <TableCard action={mostrarAcciones ? <ModalCargarGasto triggerLabel="+ Nuevo gasto" /> : undefined}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Concepto</TableHead>
            <TableHead>Propiedad</TableHead>
            <TableHead className="text-center">Cargo a</TableHead>
            <TableHead className="text-right">Monto</TableHead>
            <TableHead className="text-center">Estado</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {gastos.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                No hay gastos cargados.
              </TableCell>
            </TableRow>
          ) : (
            gastos.map((g) => (
              <TableRow key={g.id}>
                <TableCell className="font-medium">
                  {g.concepto}
                  {g.categoria_interno && (
                    <span className="block text-xs text-muted-foreground">{g.categoria_interno}</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {g.propiedad?.direccion ?? "— (propio)"}
                </TableCell>
                <TableCell className="text-center">
                  <EstadoBadge valor={g.cargo_a} colores={COLORES_CARGO} />
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatMonto(g.monto.toString())}
                </TableCell>
                <TableCell className="text-center">
                  <EstadoBadge valor={g.estado_pago} colores={COLORES_ESTADO_PAGO} />
                </TableCell>
                <TableCell>
                  {mostrarAcciones && g.estado_pago === "PENDIENTE" && <BotonMarcarPagado id={g.id} />}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableCard>
  );
}
