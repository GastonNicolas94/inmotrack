import { PropiedadesService } from "@/services/propiedades.service";
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
import { DialogNuevaPropiedad } from "./DialogNuevaPropiedad";
import { TableCard } from "@/components/layout/TableCard";

export async function TablaPropiedades() {
  const [propiedades, propietarios] = await Promise.all([
    PropiedadesService.listar(),
    PropietariosService.listar(),
  ]);

  return (
    <TableCard
      action={
        <DialogNuevaPropiedad
          propietarios={propietarios.map((p) => ({ id: p.id, nombre: p.nombre }))}
        />
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dirección</TableHead>
            <TableHead>Propietario</TableHead>
            <TableHead className="text-center">Tipo</TableHead>
            <TableHead className="text-center">Contratos</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {propiedades.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                No hay propiedades cargadas.
              </TableCell>
            </TableRow>
          ) : (
            propiedades.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.direccion}</TableCell>
                <TableCell className="text-muted-foreground">
                  {p.propietario.nombre}
                </TableCell>
                <TableCell className="text-center">
                  {p.es_propia ? (
                    <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                      Propia
                    </Badge>
                  ) : (
                    <Badge variant="outline">Administrada</Badge>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="secondary">{p._count.contratos}</Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableCard>
  );
}
