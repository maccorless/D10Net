import postgres from "postgres";
import { readdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

export async function runMigrations(databaseUrl: string) {
  const sql = postgres(databaseUrl);
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const migrationDir = join(__dirname, "db/migrations");

  // Create migrations table if it doesn't exist
  await sql`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Read and execute migrations in order
  const files = readdirSync(migrationDir)
    .filter((f) => f.endsWith(".sql") && f.match(/^\d{4}_/))
    .sort();

  for (const file of files) {
    const [existing] = await sql`
      SELECT id FROM migrations WHERE name = ${file}
    `;

    if (existing) {
      console.log(`✓ Migration ${file} already applied`);
      continue;
    }

    const sql_content = readFileSync(join(migrationDir, file), "utf-8");
    console.log(`Running migration ${file}...`);

    try {
      // Execute migration (split by semicolon for multiple statements)
      for (const statement of sql_content.split(";").filter((s) => s.trim())) {
        await sql.unsafe(statement);
      }

      // Record migration
      await sql`
        INSERT INTO migrations (name) VALUES (${file})
      `;

      console.log(`✓ Migration ${file} completed`);
    } catch (error) {
      console.error(`✗ Migration ${file} failed:`, error);
      throw error;
    }
  }

  await sql.end();
  console.log("All migrations completed successfully");
}
