import Link from "next/link";
import { ArrowUpRight, Users, Wallet } from "lucide-react";
import { PropietariosService } from "@/services/propietarios.service";
import { PagosService } from "@/services/pagos.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });

/** Sección desktop del prototipo; los datos provienen de los servicios existentes. */
export async function DashboardBottomLists() {
  const [owners, payments] = await Promise.all([
    PropietariosService.listar(),
    PagosService.listarRecientes(6),
  ]);
  return (
    <section className="inmotrack-desktop-only grid gap-3 lg:grid-cols-2" aria-label="Propietarios y actividad reciente">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Propietarios</CardTitle>
          <Link href="/propietarios" className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
            Ver todos <ArrowUpRight aria-hidden="true" className="size-4" />
          </Link>
        </CardHeader>
        <CardContent>
          {owners.length === 0 ? <p className="py-4 text-[12px] text-muted-foreground">Todavía no hay propietarios cargados.</p> :
            <ul className="divide-y divide-border">
              {owners.slice(0, 6).map((owner) => (
                <li key={owner.id} className="flex items-center gap-3 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><Users aria-hidden="true" className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold">{owner.nombre}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{owner._count.participaciones} {owner._count.participaciones === 1 ? "propiedad" : "propiedades"}</p>
                  </div>
                </li>
              ))}
            </ul>
          }
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Actividad reciente</CardTitle>
          <Link href="/pagos" className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
            Ver cobranza <ArrowUpRight aria-hidden="true" className="size-4" />
          </Link>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? <p className="py-4 text-[12px] text-muted-foreground">Todavía no hay pagos registrados.</p> :
            <ul className="divide-y divide-border">
              {payments.map((payment) => <li key={payment.id} className="flex items-center gap-3 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><Wallet aria-hidden="true" className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold">{payment.inquilino}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{payment.direccion} · {date.format(payment.fecha)}</p>
                </div>
                <span className="inmotrack-amount shrink-0 text-[12px] font-semibold">{money.format(Number(payment.monto))}</span>
              </li>)}
            </ul>
          }
        </CardContent>
      </Card>
    </section>
  );
}
