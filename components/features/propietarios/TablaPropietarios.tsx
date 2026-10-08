import { ListadoTools } from "@/components/layout/ListadoTools";
import { requireAuthenticatedUser } from "@/lib/auth-context";
import { PropietariosService } from "@/services/propietarios.service";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DialogNuevoPropietario } from "./DialogNuevoPropietario";
import { ModalRegistrarAdelanto } from "./ModalRegistrarAdelanto";
import { TableCard } from "@/components/layout/TableCard";

function maskCbu(cbu: string) {
  return cbu.slice(0, 4) + "****" + cbu.slice(-4);
}

export async function TablaPropietarios() {
  const [user, propietarios] = await Promise.all([requireAuthenticatedUser(), PropietariosService.listar()]);
  const puedeCrear = user.rol !== "AUDITOR";
  const puedeAdelantar = user.rol === "ADMIN";

  return (
    <ListadoTools filename="propietarios.csv" columns={["Nombre","CBU","Propiedades"]} rows={propietarios.map((p) => [p.nombre, maskCbu(p.cbu), String(p._count.participaciones)])}>
    <TableCard action={puedeCrear ? <DialogNuevoPropietario /> : undefined}>
      <Table className="inmotrack-card-table" data-kind="propietarios">
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>CBU</TableHead>
            <TableHead className="text-center">Propiedades</TableHead>
            {puedeAdelantar ? <TableHead /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {propietarios.length === 0 ? (
            <TableRow>
              <TableCell colSpan={puedeAdelantar ? 4 : 3} className="text-center text-muted-foreground py-8">
                No hay propietarios cargados.
              </TableCell>
            </TableRow>
          ) : (
            propietarios.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.nombre}</TableCell>
                <TableCell className="font-heading tabular-nums text-sm text-muted-foreground">
                  {maskCbu(p.cbu)}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="secondary">{p._count.participaciones}</Badge>
                </TableCell>
                {puedeAdelantar ? (
                  <TableCell className="text-right">
                    <ModalRegistrarAdelanto propietarioId={p.id} nombre={p.nombre} />
                  </TableCell>
                ) : null}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableCard>
    </ListadoTools>
  );
}
