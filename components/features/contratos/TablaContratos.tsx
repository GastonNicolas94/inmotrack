import { requireAuthenticatedUser } from "@/lib/auth-context";
import { ContratosService } from "@/services/contratos.service";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { BadgeEstadoContrato } from "./BadgeEstadoContrato";
import { BotonesContrato } from "./BotonesContrato";
import { ModalPeriodos } from "./ModalPeriodos";
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
            contratos.map((c) => (
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
                  <BadgeEstadoContrato estado={c.estado} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <ModalPeriodos
                      contratoId={c.id}
                      label={`${c.propiedad.direccion} — ${c.inquilino.nombre}`}
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
            ))
          )}
        </TableBody>
      </Table>
    </TableCard>
  );
}
