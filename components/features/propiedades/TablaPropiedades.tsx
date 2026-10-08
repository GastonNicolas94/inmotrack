import { ListadoTools } from "@/components/layout/ListadoTools";
import { requireAuthenticatedUser } from "@/lib/auth-context";
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
  const [user, propiedades, propietarios] = await Promise.all([
    requireAuthenticatedUser(),
    PropiedadesService.listar(),
    PropietariosService.listar(),
  ]);
  const mostrarAcciones = user.rol !== "AUDITOR";
  const opcionesPropietarios = propietarios.map((p) => ({
    id: p.id,
    nombre: p.nombre,
  }));

  return (
    <ListadoTools filename="propiedades.csv" columns={["Dirección","Propietarios","Tipo","Contratos"]} rows={propiedades.map((p) => [p.direccion, p.copropietarios.map((o) => `${o.propietario.nombre} (${Number(o.porcentaje).toFixed(2)}%)`).join(" / "), p.es_propia ? "Propia" : "Administrada", String(p._count.contratos)])}>
    <TableCard
      action={mostrarAcciones ? <DialogNuevaPropiedad propietarios={opcionesPropietarios} /> : undefined}
    >
      <Table className="inmotrack-card-table" data-kind="propiedades">
        <TableHeader>
          <TableRow>
            <TableHead>Dirección</TableHead>
            <TableHead>Propietarios</TableHead>
            <TableHead className="text-center">Tipo</TableHead>
            <TableHead className="text-center">Contratos</TableHead>
            {mostrarAcciones ? <TableHead className="text-right">Acciones</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {propiedades.length === 0 ? (
            <TableRow>
              <TableCell colSpan={mostrarAcciones ? 5 : 4} className="text-center text-muted-foreground py-8">
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
                    <Badge className="bg-status-neutral-bg text-status-neutral">
                      Propia
                    </Badge>
                  ) : (
                    <Badge variant="outline">Administrada</Badge>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="secondary">{p._count.contratos}</Badge>
                </TableCell>
                {mostrarAcciones ? (
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
