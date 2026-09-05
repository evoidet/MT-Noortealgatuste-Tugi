import { openDatabase } from "../src/database.js";
import { safeOperationalError } from "../src/safe-errors.js";
import { loadMigrations } from "./db-migrate.mjs";

async function main() {
  const connectionString = process.env.STORAGE_DATABASE_URL_UNPOOLED;
  if (!connectionString) {
    console.error("STORAGE_DATABASE_URL_UNPOOLED is required.");
    process.exitCode = 1;
    return;
  }
  const database = openDatabase(connectionString);
  try {
    await database.assertSubmissionSchema();
    const migrations = await loadMigrations();
    const { rows } = await database.raw.query("SELECT version, name, checksum FROM schema_migrations");
    for (const migration of migrations) {
      const applied = rows.find((row) => row.version === migration.version);
      if (!applied || applied.name !== migration.name || applied.checksum !== migration.checksum) {
        console.error(`Migration ${migration.name}: missing or checksum mismatch.`);
        process.exitCode = 1;
      }
    }
    if (!process.exitCode) console.log("Submission schema and migration checksums are current.");
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  console.error("Submission schema check failed:", safeOperationalError(error, "SCHEMA_CHECK_FAILED"));
  process.exitCode = 1;
});
