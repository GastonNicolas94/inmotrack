import { TransaccionesService } from "@/services/transacciones.service";
import { requireAuthenticatedUser } from "@/lib/auth-context";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TableCard } from "@/components/layout/TableCard";
import { BadgeTipoTransaccion } from "./BadgeTipoTransaccion";
import { ModalContraAsiento } from "./ModalContraAsiento";

function formatMonto(n: number | string) {
  return Number(n).toLocaleString("es-AR", {
    style: "currency", currency: "ARS", maximumFractionDigits: 0,
  });
}

export async function TablaLibroDiario({
  filtros,
}: {
  filtros: { tipo?: string; caja?: string; desde?: string; hasta?: string };
}) {
  const user = await requireAuthenticatedUser();
  const transacciones = await TransaccionesService.listar({
    tipo: filtros.tipo,
    caja_destino: filtros.caja,
    desde: filtros.desde ? new Date(filtros.desde) : undefined,
    hasta: filtros.hasta ? new Date(filtros.hasta) : undefined,
  });
  const esAdmin = user.rol === "ADMIN";

  return (
    <TableCard>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead className="text-center">Tipo</TableHead>
            <TableHead className="text-center">Caja</TableHead>
            <TableHead className="text-right">Monto</TableHead>
            <TableHead>Usuario</TableHead>
            {esAdmin && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {transacciones.length === 0 ? (
            <TableRow>
              <TableCell colSpan={esAdmin ? 6 : 5} className="text-center text-muted-foreground py-8">
                No hay movimientos para este filtro.
              </TableCell>
            </TableRow>
          ) : (
            transacciones.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(t.fecha_transaccion).toLocaleString("es-AR")}
                </TableCell>
                <TableCell className="text-center">
                  <BadgeTipoTransaccion tipo={t.tipo} />
                </TableCell>
                <TableCell className="text-center text-xs text-muted-foreground">{t.caja_destino}</TableCell>
                <TableCell
                  className={`text-right font-mono text-sm ${
                    Number(t.monto) < 0 ? "text-status-danger" : "text-status-success"
                  }`}
                >
                  {formatMonto(t.monto.toString())}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {t.usuario_creador?.email ?? "Sistema"}
                </TableCell>
                {esAdmin && (
                  <TableCell>
                    {t.tipo !== "CONTRA_ASIENTO" &&
                      !t.contra_asientos.some((c) => c.tipo === "CONTRA_ASIENTO") && (
                        <ModalContraAsiento idTxnOrigen={t.id} />
                      )}
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableCard>
  );
}
