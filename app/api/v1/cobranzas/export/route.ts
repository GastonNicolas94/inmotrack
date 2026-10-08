import { requireAuthenticatedUser } from "@/lib/auth-context";
import { CobranzasService } from "@/services/cobranzas.service";
import { filtrarCobranzas, type FiltroCobranza } from "@/lib/cobranzas";

const allowed = new Set<FiltroCobranza>(["todos", "pendientes", "vencidos", "cobrados"]);

// Excel-compatible UTF-8 CSV: quote fields, neutralize formula injection.
function cell(value: string) {
  const neutralized = /^[\s]*[=+@\-\t\r]/.test(value) ? "'" + value : value;
  return '"' + neutralized.replaceAll('"', '""') + '"';
}
export async function GET(request: Request) {
  await requireAuthenticatedUser();
  const url = new URL(request.url);
  const raw = url.searchParams.get("estado") ?? "todos";
  const filtro = allowed.has(raw as FiltroCobranza) ? raw as FiltroCobranza : "todos";
  const q = (url.searchParams.get("q") ?? "").slice(0, 120);
  const periods = filtrarCobranzas(await CobranzasService.listar(), filtro, q);
  const lines = [
    ["Inquilino", "Propiedad", "Contrato", "Periodo", "Vencimiento", "Estado", "Total", "Pagado", "Pendiente"],
    ...periods.map((p) => [
      p.inquilino, p.propiedad, String(p.contratoId), p.periodo, p.vencimiento.toISOString().slice(0, 10),
      p.estado, p.total, p.pagado, p.pendiente,
    ]),
  ].map((line) => line.map(cell).join(";"));
  return new Response("\uFEFF" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="cobranzas-inmotrack.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
