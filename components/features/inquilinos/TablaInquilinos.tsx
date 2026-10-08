import { ListadoTools } from "@/components/layout/ListadoTools";
import { requireAuthenticatedUser } from "@/lib/auth-context";
import { InquilinosService } from "@/services/inquilinos.service";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DialogNuevoInquilino } from "./DialogNuevoInquilino";
import { ModalDeudaInquilino } from "./ModalDeudaInquilino";
import { TableCard } from "@/components/layout/TableCard";

export async function TablaInquilinos() {
  const [user, inquilinos] = await Promise.all([requireAuthenticatedUser(), InquilinosService.listar()]);

  return (
    <ListadoTools filename="inquilinos.csv" columns={["Nombre","DNI / CUIT","Email","Contratos"]} rows={inquilinos.map((i) => [i.nombre, i.dni_cuit, i.email ?? "", String(i._count.contratos)])}>
    <TableCard action={user.rol !== "AUDITOR" ? <DialogNuevoInquilino /> : undefined}>
      <Table className="inmotrack-card-table" data-kind="inquilinos">
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>DNI / CUIT</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="text-center">Contratos</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {inquilinos.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No hay inquilinos cargados.
              </TableCell>
            </TableRow>
          ) : (
            inquilinos.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="font-medium">{i.nombre}</TableCell>
                <TableCell className="font-heading tabular-nums text-sm">{i.dni_cuit}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{i.email ?? "—"}</TableCell>
                <TableCell className="text-center">
                  <Badge variant="secondary">{i._count.contratos}</Badge>
                </TableCell>
                <TableCell className="row-actions-cell">
                  <ModalDeudaInquilino inquilinoId={i.id} nombre={i.nombre} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableCard>
    </ListadoTools>
  );
}
