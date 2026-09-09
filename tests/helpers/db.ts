import { prisma } from "@/lib/db";

/**
 * Trunca todas las tablas del dominio de negocio y financiero, en cascada,
 * y resetea los contadores de autoincrement. Solo para uso en tests —
 * nunca importar este archivo desde código de producción.
 */
export async function cleanDatabase() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      deducciones_adelanto,
      aplicaciones_pago,
      cargos,
      liquidaciones_items,
      liquidaciones,
      transacciones,
      gastos,
      idempotency_keys,
      periodos_pago,
      outbox_cierre_periodo,
      contratos,
      inquilinos,
      propiedades,
      propietarios,
      usuarios
    RESTART IDENTITY CASCADE
  `);
}
