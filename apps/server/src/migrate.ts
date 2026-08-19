import { readdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to run migrations.");

const migrationsDirectory = resolve(fileURLToPath(new URL("../migrations", import.meta.url)));
const pool = new Pool({ connectionString });

try {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const applied = await pool.query<{ name: string }>(`SELECT name FROM schema_migrations`);
  const appliedNames = new Set(applied.rows.map((row) => row.name));
  const files = (await readdir(migrationsDirectory)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  for (const name of files) {
    if (appliedNames.has(name)) continue;
    const sql = await readFile(resolve(migrationsDirectory, name), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [name]);
      await client.query("COMMIT");
      console.info(`Applied migration ${name}`);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* connection failure already rolls back */ }
      throw error;
    } finally { client.release(); }
  }
} finally {
  await pool.end();
}
