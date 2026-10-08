"use client";

import { Children, createContext, isValidElement, useCallback, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { paginate } from "@/lib/pagination";
import { Button } from "@/components/ui/button";

export const ListSearchContext = createContext<{ query: string; texts: string[] } | null>(null);
const PaginationContext = createContext<{
  page: number; size: number; query: string; texts?: string[];
  report: (total: number) => void;
} | null>(null);

/** Server-rendered rows stay React nodes; only the active page is mounted. */
export function usePaginatedChildren(children: ReactNode) {
  const context = useContext(PaginationContext);
  const all = Children.toArray(children);
  const empty = all.length === 1 && isValidElement<{ children?: ReactNode }>(all[0]) &&
    Children.toArray(all[0].props.children).some((cell) => isValidElement<{ colSpan?: number }>(cell) && (cell.props.colSpan ?? 0) > 1);
  const result = paginate(empty ? [] : all, context?.page ?? 1, context?.size ?? 20, context?.query, context?.texts);
  const report = context?.report;
  useLayoutEffect(() => { report?.(result.total); }, [report, result.total]);
  return context ? (empty ? children : result.items) : children;
}

export function PaginatedItems({ children, className }: { children: ReactNode; className?: string }) {
  const items = usePaginatedChildren(children);
  return <ul className={className}>{items}</ul>;
}

export function ListPagination({ children }: { children: ReactNode }) {
  const search = useContext(ListSearchContext);
  const query = search?.query ?? "";
  const [size, setSize] = useState(20);
  const [selection, setSelection] = useState({ page: 1, query });
  const [total, setTotal] = useState(0);
  if (selection.query !== query) {
    setSelection({ page: 1, query });
  }
  const pages = Math.max(1, Math.ceil(total / size));
  const page = selection.query === query ? Math.min(selection.page, pages) : 1;
  const report = useCallback((count: number) => setTotal(count), []);
  const from = total ? (page - 1) * size + 1 : 0;
  const to = Math.min(page * size, total);
  return <PaginationContext.Provider value={{ page, size, query, texts: search?.texts, report }}>
    {children}
    <div className="flex flex-col gap-3 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between print:hidden">
      <p role="status" aria-live="polite" className="text-muted-foreground">Mostrando {from}–{to} de {total}</p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">Filas por página
          <select value={size} onChange={(event) => { setSize(Number(event.target.value)); setSelection({ page: 1, query }); }}
            className="h-9 rounded-md border border-input bg-card px-2 focus-visible:outline-2 focus-visible:outline-primary">
            {[10, 20, 50].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <nav aria-label="Paginación del listado" className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setSelection({ page: page - 1, query })}>Anterior</Button>
          <span className="tabular-nums">{page} / {pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setSelection({ page: page + 1, query })}>Siguiente</Button>
        </nav>
      </div>
    </div>
    {query && total === 0 ? <p role="status" className="px-3 pb-3 text-sm text-muted-foreground">No hay resultados para «{query}».</p> : null}
  </PaginationContext.Provider>;
}
