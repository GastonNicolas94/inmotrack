import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");
const checks = [
  ["app/globals.css", /--primary:\s*oklch\(\.6789\s+\.1698\s+28\.17\)/, "coral OKLCH"],
  ["app/globals.css", /--cash-dark:\s*var\(--foreground\)/, "Caja 1 oscura"],
  ["app/globals.css", /--radius:\s*\.5rem/, "radio base 8px"],
  ["app/layout.tsx", /Sora.*\n|Sora\(/, "tipografía Sora"],
  ["app/layout.tsx", /Manrope.*\n|Manrope\(/, "tipografía Manrope"],
  ["components/layout/DashboardShell.tsx", /inmotrack-mobile-bottom/, "navegación mobile"],
  ["components/features/dashboard/CashBalancesCards.tsx", /Caja 1.*Recaudadora de terceros/, "Caja 1"],
  ["components/features/dashboard/CashBalancesCards.tsx", /Caja 2.*Operativa/, "Caja 2"],
];
for (const [file, pattern, description] of checks) {
  if (!pattern.test(read(file))) throw new Error(`Design System: falta ${description} en ${file}`);
}
console.log("Design System v1.0: 8 controles estáticos OK");
