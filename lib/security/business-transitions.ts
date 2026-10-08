import { HttpError } from "@/lib/http-error";
export function assertAllowedTransition<T extends string>(current: T, next: T, transitions: Readonly<Partial<Record<T,readonly T[]>>>): void {
  if (!transitions[current]?.includes(next)) throw new HttpError("BUSINESS_RULE_VIOLATION", "Transición de estado no permitida.", 409);
}
export const LIQUIDATION_TRANSITIONS = {
  PENDIENTE: ["APROBADA", "CANCELADA"],
  APROBADA: ["PAGADA"],
  PAGADA: [],
  CANCELADA: [],
} as const;
