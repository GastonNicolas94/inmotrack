import { LiquidacionesService } from "@/services/liquidaciones.service";
import { PropietariosService } from "@/services/propietarios.service";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TableCard } from "@/components/layout/TableCard";
import { BadgeEstadoLiquidacion } from "./BadgeEstadoLiquidacion";
import { ModalGenerarLiquidacion } from "./ModalGenerarLiquidacion";
import { BotonesLiquidacion } from "./BotonesLiquidacion";

function formatMonto(n: number | string) {
  return Number(n).toLocaleString("es-AR", {
    style: "currency", currency: "ARS", maximumFractionDigits: 0,
  });
}

export async function TablaLiquidaciones() {
  const [liquidaciones, propietarios, session] = await Promise.all([
    LiquidacionesService.listar(),
    PropietariosService.listar(),
    auth(),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rol = (session?.user as any)?.rol as string | undefined;
  const esAdmin = rol === "ADMIN";
  let puedeAprobar = esAdmin;
  if (!esAdmin && rol === "EMPLEADO" && session?.user?.id) {
    const usuario = await prisma.usuario.findUnique({ where: { id: Number(session.user.id) } });
    puedeAprobar = usuario?.puede_aprobar_liquidaciones ?? false;
  }
  const mostrarAcciones = rol !== "AUDITOR";

  return (
    <TableCard action={mostrarAcciones ? <ModalGenerarLiquidacion propietarios={propietarios} /> : undefined}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Propietario</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead className="text-right">Bruto</TableHead>
            <TableHead className="text-right">Retenciones</TableHead>
            <TableHead className="text-right">Neto</TableHead>
            <TableHead className="text-center">Estado</TableHead>
            {mostrarAcciones && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {liquidaciones.length === 0 ? (
            <TableRow>
              <TableCell colSpan={mostrarAcciones ? 7 : 6} className="text-center text-muted-foreground py-8">
                No hay liquidaciones generadas.
              </TableCell>
            </TableRow>
          ) : (
            liquidaciones.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.propietario.nombre}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(l.fecha_corrida).toLocaleDateString("es-AR")}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatMonto(l.monto_bruto.toString())}
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-muted-foreground">
                  {formatMonto(l.retenciones.toString())}
                </TableCell>
                <TableCell className="text-right font-mono text-sm font-semibold">
                  {formatMonto(l.monto_neto.toString())}
                </TableCell>
                <TableCell className="text-center">
                  <BadgeEstadoLiquidacion estado={l.estado} />
                </TableCell>
                {mostrarAcciones && (
                  <TableCell>
                    <BotonesLiquidacion
                      id={l.id}
                      estado={l.estado}
                      puedeAprobar={puedeAprobar}
                      esAdmin={esAdmin}
                    />
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
