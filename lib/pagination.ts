/** Filters the full list before slicing; never mutates financial totals or export data. */
export function paginate<T>(rows: readonly T[], requestedPage: number, size: number, query = "", texts?: readonly string[]) {
  const q = query.trim().toLocaleLowerCase("es");
  const filtered = q && texts ? rows.filter((_, index) => (texts[index] ?? "").toLocaleLowerCase("es").includes(q)) : rows;
  const pageSize = [10, 20, 50].includes(size) ? size : 20;
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1));
  const offset = (page - 1) * pageSize;
  return { items: filtered.slice(offset, offset + pageSize), total, pages, page, from: total ? offset + 1 : 0, to: Math.min(offset + pageSize, total) };
}
