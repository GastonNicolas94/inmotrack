import { requireAuthenticatedUser } from "@/lib/auth-context";
import { ContratosService } from "@/services/contratos.service";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { BadgeEstadoContrato } from "./BadgeEstadoContrato";
import { BotonesContrato } from "./BotonesContrato";
import { ModalPeriodos } from "./ModalPeriodos";
import { ModalAjustesContrato } from "./ModalAjustesContrato";
import { TableCard } from "@/components/layout/TableCard";
import { formatFechaLocal } from "@/lib/fecha";

function formatMonto(n: number | string) {
  return Number(n).toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

export async function TablaContratos() {
  const user = await requireAuthenticatedUser();
  const contratos = await ContratosService.listar();
  const mostrarAcciones = user.rol !== "AUDITOR";

  return (
    <TableCard>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Propiedad</TableHead>
            <TableHead>Inquilino</TableHead>
            <TableHead>Propietario</TableHead>
            <TableHead>Vigencia</TableHead>
            <TableHead>Monto base</TableHead>
            <TableHead className="text-center">Estado</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {contratos.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                No hay contratos cargados.
              </TableCell>
            </TableRow>
          ) : (
            contratos.map((c) => {
              const ajustePendiente = c.ajustes[0] ?? null;
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.propiedad.direccion}</TableCell>
                  <TableCell>{c.inquilino.nombre}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.propiedad.propietario.nombre}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatFechaLocal(c.fecha_inicio)} – {formatFechaLocal(c.fecha_fin)}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {formatMonto(c.monto_base.toString())}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center gap-1.5">
                      <BadgeEstadoContrato estado={c.estado} />
                      {ajustePendiente ? (
                        <span className="rounded-full bg-status-warning-bg px-2 py-0.5 text-[11px] font-medium text-status-warning">
                          Ajuste pendiente
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <ModalPeriodos
                        contratoId={c.id}
                        label={`${c.propiedad.direccion} — ${c.inquilino.nombre}`}
                      />
                      <ModalAjustesContrato
                        contratoId={c.id}
                        label={`${c.propiedad.direccion} — ${c.inquilino.nombre}`}
                        canWrite={mostrarAcciones}
                        ajustePendiente={ajustePendiente ? {
                          id: ajustePendiente.id,
                          periodo_efectivo: ajustePendiente.periodo_efectivo,
                          indice: ajustePendiente.indice,
                          monto_anterior: ajustePendiente.monto_anterior.toString(),
                        } : null}
                      />
                      <BotonesContrato
                        id={c.id}
                        estado={c.estado}
                        contrato={{
                          id: c.id,
                          inquilinoId: c.id_inquilino,
                          id_propiedad: c.id_propiedad,
                          inquilino: { nombre: c.inquilino.nombre },
                          propiedad: { direccion: c.propiedad.direccion },
                        }}
                        mostrarAcciones={mostrarAcciones}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </TableCard>
  );
}
