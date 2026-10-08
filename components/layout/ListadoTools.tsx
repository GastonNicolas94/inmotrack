"use client";

import { useRef, useState, type ReactNode } from "react";
import { Download, Search } from "lucide-react";
import { generarCsv } from "@/lib/csv";

export function ListadoTools({
  children, filename, columns, rows,
}: {
  children: ReactNode;
  filename: string;
  columns: string[];
  rows: (string | number)[][];
}) {
  const root = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(rows.length);

  function filter(value: string) {
    setSearch(value);
    const q = value.trim().toLocaleLowerCase("es");
    let count = 0;
    root.current?.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((row) => {
      if (row.cells.length === 1 && row.cells[0]?.colSpan > 1) return;
      const found = !q || (row.textContent ?? "").toLocaleLowerCase("es").includes(q);
      row.hidden = !found;
      if (found) count++;
    });
    setVisibleCount(count);
  }

  function exportCsv() {
    const q = search.trim().toLocaleLowerCase("es");
    const selected = !q ? rows : rows.filter((row) =>
      row.join(" ").toLocaleLowerCase("es").includes(q),
    );
    const blob = new Blob([generarCsv(columns, selected)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename.endsWith(".csv") ? filename : filename + ".csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return <div className="space-y-3">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <label className="relative block w-full sm:max-w-[350px]">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <span className="sr-only">Buscar en el listado</span>
        <input type="search" value={search} onChange={(event) => filter(event.target.value)}
          placeholder="Buscar en el listado"
          className="h-9 w-full rounded-md border border-input bg-card pl-9 pr-3 text-[12px] focus-visible:outline-2 focus-visible:outline-primary" />
      </label>
      <button type="button" onClick={exportCsv}
        className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-[12px] font-semibold hover:bg-muted"
        aria-label={`Exportar ${filename} a CSV`}>
        <Download aria-hidden="true" className="size-4" />Exportar CSV
      </button>
    </div>
    <div ref={root}>{children}</div>
    {search ? <p role="status" className="text-[11px] text-muted-foreground">{visibleCount} resultado{visibleCount === 1 ? "" : "s"} para «{search}».</p> : null}
  </div>;
}
