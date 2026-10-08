/** Formato UTF-8 con BOM para Excel Argentina, evitando interpretación de fórmulas. */
export function csvCell(value: string | number) {
  const input = String(value);
  const escaped = /^\s*[=+@\-\t\r]/.test(input) ? "'" + input : input;
  return '"' + escaped.replaceAll('"', '""') + '"';
}
export function generarCsv(columns: string[], rows: (string | number)[][]) {
  return "\uFEFF" + [columns, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
}
