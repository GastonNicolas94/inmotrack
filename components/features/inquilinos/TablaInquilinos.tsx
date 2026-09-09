import { InquilinosService } from "@/services/inquilinos.service";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DialogNuevoInquilino } from "./DialogNuevoInquilino";
import { ModalDeudaInquilino } from "./ModalDeudaInquilino";
import { TableCard } from "@/components/layout/TableCard";

export async function TablaInquilinos() {
  const inquilinos = await InquilinosService.listar();

  return (
    <TableCard action={<DialogNuevoInquilino />}>
      <Table>
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
                <TableCell className="font-mono text-sm">{i.dni_cuit}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{i.email ?? "—"}</TableCell>
                <TableCell className="text-center">
                  <Badge variant="secondary">{i._count.contratos}</Badge>
                </TableCell>
                <TableCell>
                  <ModalDeudaInquilino inquilinoId={i.id} nombre={i.nombre} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableCard>
  );
}
