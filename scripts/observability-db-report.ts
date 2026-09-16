import { Pool } from "pg";
import { requireDatabaseUrl } from "@/lib/database-url";
import { OBSERVABILITY_DB_QUERIES } from "@/lib/observability/database";

async function main() {
  const pool = new Pool({
    connectionString: requireDatabaseUrl(),
    max: 1,
    connectionTimeoutMillis: 10_000,
  });

  try {
    for (const [name, sql] of Object.entries(OBSERVABILITY_DB_QUERIES)) {
      const result = await pool.query(sql);
      console.log(`\n## ${name}`);
      console.table(result.rows);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("observability-db-report failed", error);
  process.exitCode = 1;
});
