import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { requireDatabaseUrl } from "@/lib/database-url";
import { traceAttributes, traceSpan } from "@/lib/observability/tracing";

function createPrismaClient() {
  const pool = new Pool({
    connectionString: requireDatabaseUrl(),
    max: Number(process.env.DATABASE_POOL_MAX ?? "5"),
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
  const adapter = new PrismaPg(pool);
  const log: ("query" | "error" | "warn")[] =
    process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"];
  const client = new PrismaClient({ adapter, log });

  const tracedClient = client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const modelName = model.charAt(0).toLowerCase() + model.slice(1);
          return traceSpan(
            {
              name: `prisma.${modelName}.${operation}`,
              op: "db.prisma",
              attributes: {
                ...traceAttributes(),
                "db.system": "postgresql",
                "db.operation.name": operation,
                "db.collection.name": model,
              },
            },
            () => query(args),
          );
        },
      },
    },
  });

  // Prisma $extends returns a narrower client type that omits lifecycle APIs
  // such as $on from its TypeScript surface. InmoTrack services depend on the
  // standard PrismaClient contract, while the extension only intercepts query
  // execution at runtime, so keep the public singleton typed as PrismaClient.
  return tracedClient as unknown as PrismaClient;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
