export const DEMO_PREFIX = "[DEMO50]";
export const DEMO_CONTRACT_COUNT = 50;
export const DEMO_OWNER_COUNT = 32;
export const DEMO_BASE_DATE = "2026-10-07";

export type DemoContractState = "BORRADOR" | "ACTIVO" | "MOROSO" | "POR_VENCER" | "VENCIDO" | "RESCINDIDO";
export type DemoContractPlan = {
  index: number;
  state: DemoContractState;
  ownerIndex: number;
  secondaryOwnerIndex: number | null;
  ownerPct: number;
  started: Date;
  finished: Date;
  monthlyRent: number;
  commissionPct: number;
  ownProperty: boolean;
  paymentMode: "FULL" | "PARTIAL" | "DELINQUENT" | "MIXED";
};
export function addMonthsUTC(date: Date, delta: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1));
}
export function monthId(date: Date) {
  return String(date.getUTCFullYear()) + "-" + String(date.getUTCMonth() + 1).padStart(2, "0");
}
export function referenceMonth(date = DEMO_BASE_DATE) {
  const p = new Date(date.slice(0, 10) + "T12:00:00Z");
  if (Number.isNaN(p.valueOf())) throw new Error("Fecha demo inválida");
  return new Date(Date.UTC(p.getUTCFullYear(), p.getUTCMonth(), 1));
}
export function buildDemoPlans(date = DEMO_BASE_DATE): DemoContractPlan[] {
  const now = referenceMonth(date);
  return Array.from({ length: DEMO_CONTRACT_COUNT }, (_, index) => {
    const state: DemoContractState = index < 4 ? "BORRADOR"
      : index < 28 ? "ACTIVO"
      : index < 40 ? "MOROSO"
      : index < 44 ? "POR_VENCER"
      : index < 47 ? "VENCIDO" : "RESCINDIDO";
    const started = addMonthsUTC(now, -(4 + ((index * 7) % 20)));
    const finished = addMonthsUTC(started, state === "VENCIDO" ? 12 : state === "POR_VENCER" ? 14 : 30);
    const ownProperty = index % 10 === 0;
    const ownerIndex = index % DEMO_OWNER_COUNT;
    const second = !ownProperty && index % 4 === 1 ? (index * 3 + 7) % DEMO_OWNER_COUNT : null;
    const secondaryOwnerIndex = second === ownerIndex ? (ownerIndex + 1) % DEMO_OWNER_COUNT : second;
    return {
      index, state, ownerIndex, secondaryOwnerIndex,
      ownerPct: secondaryOwnerIndex === null ? 100 : index % 2 ? 60 : 70,
      started, finished, monthlyRent: 270000 + (index * 31731) % 870000,
      commissionPct: ownProperty ? 100 : 7 + (index % 6), ownProperty,
      paymentMode: (["FULL", "PARTIAL", "DELINQUENT", "MIXED"] as const)[index % 4],
    };
  });
}
export function demoPaymentRate(plan: DemoContractPlan, monthIndex: number, due: Date, now: Date): number {
  if (plan.state === "BORRADOR" || due > now) return 0;
  if (plan.state === "MOROSO" && monthIndex >= 2) return 0;
  if (plan.paymentMode === "FULL") return 1;
  if (plan.paymentMode === "PARTIAL") return monthIndex % 3 === 0 ? 0.5 : 0.8;
  if (plan.paymentMode === "DELINQUENT") return monthIndex % 4 === 0 ? 1 : 0;
  return monthIndex % 5 === 0 ? 0.35 : monthIndex % 3 === 0 ? 1 : 0.7;
}
export function plannedMonths(plan: DemoContractPlan, now = referenceMonth()) {
  if (plan.state === "BORRADOR") return [];
  const months: Date[] = [];
  const end = addMonthsUTC(now, 2);
  for (let date = plan.started; date <= end && date <= plan.finished && months.length < 28; date = addMonthsUTC(date, 1)) {
    months.push(date);
  }
  return months;
}
export function demoInventory() {
  const plans = buildDemoPlans();
  const states = Object.fromEntries((["BORRADOR", "ACTIVO", "MOROSO", "POR_VENCER", "VENCIDO", "RESCINDIDO"] as const).map(
    (state) => [state, plans.filter((x) => x.state === state).length],
  ));
  return {
    contratos: plans.length,
    propiedades: plans.length,
    inquilinos: plans.length,
    propietarios: DEMO_OWNER_COUNT,
    periodosEstimados: plans.reduce((n,p) => n + plannedMonths(p).length, 0),
    copropiedades: plans.filter(x => x.secondaryOwnerIndex !== null).length,
    estados: states,
  };
}
