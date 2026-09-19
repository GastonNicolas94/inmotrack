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
import { DialogEditarPropiedad } from "./DialogEditarPropiedad";
import { TableCard } from "@/components/layout/TableCard";

export async function TablaPropiedades() {
  const [propiedades, propietarios] = await Promise.all([
    PropiedadesService.listar(),
    PropietariosService.listar(),
  ]);
  const opcionesPropietarios = propietarios.map((p) => ({
    id: p.id,
    nombre: p.nombre,
  }));

  return (
    <TableCard
      action={<DialogNuevaPropiedad propietarios={opcionesPropietarios} />}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dirección</TableHead>
            <TableHead>Propietarios</TableHead>
            <TableHead className="text-center">Tipo</TableHead>
            <TableHead className="text-center">Contratos</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {propiedades.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No hay propiedades cargadas.
              </TableCell>
            </TableRow>
          ) : (
            propiedades.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.direccion}</TableCell>
                <TableCell className="text-muted-foreground">
                  <div className="space-y-1">
                    {p.copropietarios.map((participacion) => (
                      <div key={participacion.id_propietario}>
                        {participacion.propietario.nombre} ·{" "}
                        {Number(participacion.porcentaje).toFixed(2)}%
                      </div>
                    ))}
                  </div>
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
                <TableCell className="text-right">
                  <DialogEditarPropiedad
                    propietarios={opcionesPropietarios}
                    propiedad={{
                      id: p.id,
                      direccion: p.direccion,
                      es_propia: p.es_propia,
                      participaciones: p.copropietarios.map((participacion) => ({
                        id_propietario: participacion.id_propietario,
                        porcentaje: Number(participacion.porcentaje),
                      })),
                    }}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableCard>
  );
}
