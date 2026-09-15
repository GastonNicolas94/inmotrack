"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function RelojPruebas({ initialFecha }: { initialFecha: string }) {
  const [fecha, setFecha] = useState(initialFecha);
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<string>("");

  async function ejecutar(ejecutar: boolean) {
    setLoading(true);
    setResultado("");
    try {
      const response = await fetch("/api/v1/dev/reloj-pruebas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha, ejecutar }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? "No se pudo aplicar la fecha de prueba.");

      if (!ejecutar) {
        setResultado(`Fecha de prueba activa: ${data.fecha}`);
        return;
      }

      const r = data.resultado;
      setResultado(
        `Fecha ${data.fecha}. Encolados: ${r.encolados}. Vencidos: ${r.vencidos}. Filas procesadas: ${r.procesadas}${r.limiteAlcanzado ? " (se alcanzó el límite de seguridad)" : ""}.`,
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
            Esta fecha queda activa para tu navegador durante 8 horas y se propaga al worker cuando aplicás un ajuste desde Contratos.
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 space-y-2 text-sm font-medium">
            Fecha simulada
            <input
              type="date"
              value={fecha}
              onChange={(event) => setFecha(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </label>
          <Button type="button" variant="outline" disabled={loading || !fecha} onClick={() => ejecutar(false)}>
            Aplicar fecha
          </Button>
          <Button type="button" disabled={loading || !fecha} onClick={() => ejecutar(true)}>
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
          Probá enero → febrero → marzo → abril. En abril, si el contrato ajusta cada 3 meses, el cierre debe detenerse y aparecer el ajuste pendiente.
        </p>
        <div className="mt-4 flex gap-3">
          <Button asChild variant="outline"><Link href="/contratos">Ir a Contratos</Link></Button>
          <Button asChild variant="outline"><Link href="/">Ir al Dashboard</Link></Button>
        </div>
      </div>
    </div>
  );
}
