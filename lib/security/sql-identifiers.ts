import { HttpError } from "@/lib/http-error";
export function chooseSqlIdentifier<T extends string>(value: string, allowed: readonly T[]): T {
  const match = allowed.find(candidate => candidate === value);
  if (!match) throw new HttpError("VALIDATION_ERROR", "Campo SQL inválido.", 400);
  return match;
}
export function chooseSortDirection(value: string): "ASC" | "DESC" {
  if(value !== "asc" && value !== "desc") throw new HttpError("VALIDATION_ERROR", "Orden inválido.", 400);
  return value.toUpperCase() as "ASC" | "DESC";
}
