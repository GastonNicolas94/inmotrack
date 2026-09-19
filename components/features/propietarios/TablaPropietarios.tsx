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
  const propietarios = await PropietariosService.listar();

  return (
    <TableCard action={<DialogNuevoPropietario />}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>CBU</TableHead>
            <TableHead className="text-center">Propiedades</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {propietarios.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                No hay propietarios cargados.
              </TableCell>
            </TableRow>
          ) : (
            propietarios.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.nombre}</TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">
                  {maskCbu(p.cbu)}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="secondary">{p._count.participaciones}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <ModalRegistrarAdelanto propietarioId={p.id} nombre={p.nombre} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableCard>
  );
}
