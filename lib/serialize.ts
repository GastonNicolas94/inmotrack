/**
 * Convierte objetos Prisma a plain objects serializables por Next.js.
 * Prisma usa Decimal y Date que no pueden pasarse directamente a Client Components.
 * JSON.parse(JSON.stringify()) los convierte: Decimal → string, Date → string ISO.
 */
export function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}
