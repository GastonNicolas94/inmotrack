"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";

export function RelojPruebas({ initialFecha }: { initialFecha: string }) {
  const [fecha, setFecha] = useState(initialFecha);
  const [idContrato, setIdContrato] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<string>("");
  const contratoValido = Number.isInteger(Number(idContrato)) && Number(idContrato) > 0;

  async function ejecutar(ejecutar: boolean) {
    setLoading(true);
    setResultado("");
    try {
      const response = await fetch("/api/v1/dev/reloj-pruebas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha,
          ejecutar,
          idContrato: contratoValido ? Number(idContrato) : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? "No se pudo aplicar la fecha de prueba.");

      if (!ejecutar) {
        setResultado(`Fecha de prueba activa: ${data.fecha}`);
        return;
      }

      const r = data.resultado;
      setResultado(
        `Contrato #${r.idContrato} · Fecha ${data.fecha}. Encolados: ${r.encolados}. Vencidos: ${r.vencidos}. Filas procesadas: ${r.procesadas}${r.limiteAlcanzado ? " (se alcanzó el límite de seguridad)" : ""}.`,
      );
    } catch (error) {
      setResultado(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function limpiar() {
    setLoading(true);
    setResultado("");
    try {
      const response = await fetch("/api/v1/dev/reloj-pruebas", { method: "DELETE" });
      if (!response.ok) throw new Error("No se pudo desactivar el reloj de prueba.");
      setResultado("Reloj de prueba desactivado. El sistema vuelve a usar la fecha real.");
    } catch (error) {
      setResultado(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Fecha operativa de prueba</h2>
          <p className="text-sm text-muted-foreground">
            La ejecución queda limitada al contrato que indiques. La fecha se conserva durante 8 horas y también se usa cuando aplicás su ajuste desde Contratos.
          </p>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_220px]">
          <label className="space-y-2 text-sm font-medium">
            Fecha simulada
            <input
              type="date"
              value={fecha}
              onChange={(event) => setFecha(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </label>
          <label className="space-y-2 text-sm font-medium">
            ID contrato de prueba
            <input
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={idContrato}
              onChange={(event) => setIdContrato(event.target.value)}
              placeholder="Ej. 12"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="button" variant="outline" disabled={loading || !fecha} onClick={() => ejecutar(false)}>
            Aplicar fecha
          </Button>
          <Button type="button" disabled={loading || !fecha || !contratoValido} onClick={() => ejecutar(true)}>
            Aplicar y ejecutar cierre
          </Button>
          <Button type="button" variant="ghost" disabled={loading} onClick={limpiar}>
            Usar fecha real
          </Button>
        </div>

        {resultado && (
          <div className="mt-5 rounded-lg border border-border bg-muted/40 p-4 text-sm">
            {resultado}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border p-5">
        <h3 className="font-medium">Recorrido sugerido</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Elegí un contrato de prueba y recorré enero → febrero → marzo → abril. En abril, si ajusta cada 3 meses, el cierre debe detenerse y aparecer el ajuste pendiente. Aplicalo desde Contratos y el worker continuará con la misma fecha simulada.
        </p>
        <div className="mt-4 flex gap-3">
          <Link className={buttonVariants({ variant: "outline" })} href="/contratos">Ir a Contratos</Link>
          <Link className={buttonVariants({ variant: "outline" })} href="/">Ir al Dashboard</Link>
        </div>
      </div>
    </div>
  );
}
