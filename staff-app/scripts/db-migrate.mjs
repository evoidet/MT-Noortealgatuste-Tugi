import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = resolve(scriptDirectory, "../migrations");
const migrationPattern = /^(\d{3,})_([a-z0-9][a-z0-9_-]*)\.sql$/;
const unpooledDatabaseUrl = String(process.env.STORAGE_DATABASE_URL_UNPOOLED ?? "").trim();

function checksum(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function safeErrorMessage(error) {
  const message = String(error?.message || "unknown migration error");
  return unpooledDatabaseUrl ? message.split(unpooledDatabaseUrl).join("[redacted]") : message;
}

async function loadMigrations() {
  const entries = await readdir(migrationsDirectory, { withFileTypes: true });
  const migrations = [];
  const versions = new Set();

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = migrationPattern.exec(entry.name);
    if (!match) continue;
    const version = match[1];
    if (versions.has(version)) throw new Error(`Duplicate database migration version: ${version}`);
    versions.add(version);
    const sql = await readFile(resolve(migrationsDirectory, entry.name), "utf8");
    migrations.push({ version, name: entry.name, sql, checksum: checksum(sql) });
  }

  migrations.sort((left, right) => {
    const byVersion = BigInt(left.version) < BigInt(right.version)
      ? -1
      : BigInt(left.version) > BigInt(right.version)
        ? 1
        : 0;
    return byVersion || left.name.localeCompare(right.name);
  });
  return migrations;
}

async function main() {
  if (!unpooledDatabaseUrl) throw new Error("STORAGE_DATABASE_URL_UNPOOLED is required.");
  const migrations = await loadMigrations();
  if (migrations.length === 0) throw new Error("No database migrations were found.");

  const pool = new Pool({
    connectionString: unpooledDatabaseUrl,
    max: 1,
    allowExitOnIdle: true,
    application_name: "noortetugi-staff-migrations"
  });
  const client = await pool.connect();

  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", ["noortetugi_staff_schema_migrations"]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const appliedResult = await client.query(
      "SELECT version, name, checksum FROM schema_migrations ORDER BY version"
    );
    const applied = new Map(appliedResult.rows.map((row) => [row.version, row]));
    let appliedCount = 0;

    for (const migration of migrations) {
      const previous = applied.get(migration.version);
      if (previous) {
        if (previous.name !== migration.name || previous.checksum !== migration.checksum) {
          throw new Error(
            `Applied migration ${migration.version} no longer matches ${migration.name}; ` +
            "create a new migration instead of editing migration history."
          );
        }
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(`
          INSERT INTO schema_migrations (version, name, checksum)
          VALUES ($1, $2, $3)
        `, [migration.version, migration.name, migration.checksum]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      appliedCount += 1;
      console.log(`Applied database migration ${migration.name}.`);
    }

    if (appliedCount === 0) console.log("Database schema is already up to date.");
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", ["noortetugi_staff_schema_migrations"]);
    } catch {
      // The connection closing also releases the advisory lock.
    }
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Database migration failed: ${safeErrorMessage(error)}`);
  process.exitCode = 1;
});
