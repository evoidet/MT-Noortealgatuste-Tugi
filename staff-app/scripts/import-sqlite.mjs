import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";

const { Pool } = pg;
const unpooledDatabaseUrl = String(process.env.STORAGE_DATABASE_URL_UNPOOLED ?? "").trim();
const timestampColumns = new Set([
  "created_at",
  "updated_at",
  "last_login_at",
  "submitted_at",
  "storage_updated_at"
]);
const jsonColumns = new Set(["data_json", "metadata_json"]);
const integerColumns = new Set(["revision_no", "size_bytes", "id"]);

const TABLES = [
  {
    name: "users",
    primaryKey: "id",
    columns: [
      "id", "google_subject", "email", "name", "google_picture_url", "role",
      "created_at", "updated_at", "last_login_at"
    ],
    map: (row) => ({
      id: row.id,
      google_subject: row.google_subject ?? null,
      email: row.email,
      name: row.name,
      google_picture_url: row.google_picture_url ?? null,
      role: row.role,
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_login_at: row.last_login_at ?? null
    })
  },
  {
    name: "submissions",
    primaryKey: "id",
    columns: [
      "id", "type", "creator_id", "status", "data_json", "revision_no",
      "created_at", "updated_at", "submitted_at"
    ],
    map: (row) => ({ ...row, submitted_at: row.submitted_at ?? null })
  },
  {
    name: "revisions",
    primaryKey: "id",
    columns: [
      "id", "submission_id", "revision_no", "data_json", "event", "created_by", "created_at"
    ],
    map: (row) => row
  },
  {
    name: "reviews",
    primaryKey: "id",
    columns: [
      "id", "submission_id", "reviewer_id", "decision", "comment", "created_at"
    ],
    map: (row) => ({ ...row, comment: row.comment ?? null })
  },
  {
    name: "attachments",
    primaryKey: "id",
    columns: [
      "id", "submission_id", "uploader_id", "storage_name", "storage_status",
      "blob_pathname", "blob_url", "original_name", "mime_type", "kind",
      "size_bytes", "sha256", "created_at", "storage_updated_at"
    ],
    map: (row) => ({
      id: row.id,
      submission_id: row.submission_id,
      uploader_id: row.uploader_id,
      storage_name: row.storage_name,
      // Local files are deliberately hidden until a separate private-Blob transfer marks them ready.
      storage_status: row.blob_pathname && row.blob_url ? "ready" : "pending",
      blob_pathname: row.blob_pathname ?? null,
      blob_url: row.blob_url ?? null,
      original_name: row.original_name,
      mime_type: row.mime_type,
      kind: row.kind ?? "additional",
      size_bytes: row.size_bytes,
      sha256: row.sha256 ?? null,
      created_at: row.created_at,
      storage_updated_at: row.storage_updated_at ?? row.created_at
    })
  },
  {
    name: "audit_logs",
    primaryKey: "id",
    columns: [
      "id", "user_id", "email", "action", "target_type", "target_id",
      "metadata_json", "ip_hash", "created_at"
    ],
    map: (row) => ({
      ...row,
      user_id: row.user_id ?? null,
      email: row.email ?? null,
      target_type: row.target_type ?? null,
      target_id: row.target_id ?? null,
      metadata_json: row.metadata_json || "{}",
      ip_hash: row.ip_hash ?? null
    })
  }
];

function usage() {
  console.log(`Usage:
  node scripts/import-sqlite.mjs --sqlite <path> --dry-run
  node scripts/import-sqlite.mjs --sqlite <path> --apply

The command never overwrites target rows. Run --dry-run first against the same
STORAGE_DATABASE_URL_UNPOOLED, take database and upload-directory backups, then run --apply once.
Local attachment files require a separate private Vercel Blob transfer.`);
}

function parseArguments(argv) {
  const parsed = { sqlitePath: "", apply: false, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (argument === "--sqlite") {
      parsed.sqlitePath = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (argument === "--apply") {
      parsed.apply = true;
      continue;
    }
    if (argument === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  if (!parsed.sqlitePath) throw new Error("--sqlite <path> is required.");
  if (parsed.apply === parsed.dryRun) {
    throw new Error("Choose exactly one of --dry-run or --apply.");
  }
  return parsed;
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortJson(value[key])])
  );
}

function canonicalValue(column, value) {
  if (value === null || value === undefined) return null;
  if (jsonColumns.has(column)) {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return JSON.stringify(sortJson(parsed));
  }
  if (timestampColumns.has(column)) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid timestamp in column ${column}.`);
    return parsed.toISOString();
  }
  if (integerColumns.has(column) && /^-?\d+$/.test(String(value))) return String(value);
  return String(value);
}

function recordsMatch(definition, source, target) {
  return definition.columns.every((column) =>
    canonicalValue(column, source[column]) === canonicalValue(column, target[column])
  );
}

function sourceTableNames(sqlite) {
  return new Set(
    sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name)
  );
}

function sourceColumns(sqlite, tableName) {
  return new Set(
    sqlite.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all().map((row) => row.name)
  );
}

function readSource(sqlite) {
  const availableTables = sourceTableNames(sqlite);
  for (const definition of TABLES) {
    if (!availableTables.has(definition.name)) {
      throw new Error(`Required SQLite table is missing: ${definition.name}`);
    }
  }

  const rowsByTable = new Map();
  for (const definition of TABLES) {
    const rows = sqlite.prepare(`SELECT * FROM ${quoteIdentifier(definition.name)}`).all();
    rowsByTable.set(definition.name, rows);
  }

  const attachmentColumns = sourceColumns(sqlite, "attachments");
  if (!attachmentColumns.has("kind")) {
    const submissionTypes = new Map(
      rowsByTable.get("submissions").map((row) => [row.id, row.type])
    );
    const firstExpenseAttachment = new Map();
    const orderedAttachments = [...rowsByTable.get("attachments")].sort((left, right) =>
      String(left.created_at).localeCompare(String(right.created_at)) || String(left.id).localeCompare(String(right.id))
    );
    for (const row of orderedAttachments) {
      if (submissionTypes.get(row.submission_id) !== "expense") continue;
      if (!firstExpenseAttachment.has(row.submission_id)) {
        firstExpenseAttachment.set(row.submission_id, row.id);
      }
    }
    rowsByTable.set("attachments", rowsByTable.get("attachments").map((row) => ({
      ...row,
      kind: firstExpenseAttachment.get(row.submission_id) === row.id ? "primary" : "additional"
    })));
  }

  return {
    rowsByTable,
    skippedAuthState: {
      sessions: availableTables.has("sessions")
        ? sqlite.prepare("SELECT COUNT(*) AS count FROM sessions").get().count
        : 0,
      oauthAttempts: availableTables.has("oauth_attempts")
        ? sqlite.prepare("SELECT COUNT(*) AS count FROM oauth_attempts").get().count
        : 0
    }
  };
}

async function ensureMigrations(client) {
  const result = await client.query(`
    SELECT version FROM schema_migrations WHERE version IN ('001', '002')
  `);
  const applied = new Set(result.rows.map((row) => row.version));
  if (!applied.has("001") || !applied.has("002")) {
    throw new Error("Run npm run db:migrate before importing SQLite data.");
  }
}

async function importRecord(client, definition, record) {
  const primaryValue = record[definition.primaryKey];
  const existing = await client.query(
    `SELECT ${definition.columns.map(quoteIdentifier).join(", ")}
     FROM ${quoteIdentifier(definition.name)}
     WHERE ${quoteIdentifier(definition.primaryKey)} = $1`,
    [primaryValue]
  );
  if (existing.rows[0]) {
    if (!recordsMatch(definition, record, existing.rows[0])) {
      throw new Error(
        `Target conflict in ${definition.name} for primary key ${String(primaryValue)}; no rows were overwritten.`
      );
    }
    return "unchanged";
  }

  const placeholders = definition.columns.map((_, index) => `$${index + 1}`).join(", ");
  await client.query(
    `INSERT INTO ${quoteIdentifier(definition.name)}
       (${definition.columns.map(quoteIdentifier).join(", ")})
     VALUES (${placeholders})`,
    definition.columns.map((column) => record[column])
  );
  return "inserted";
}

async function resetAuditIdentity(pool) {
  await pool.query(`
    SELECT setval(
      pg_get_serial_sequence('audit_logs', 'id'),
      COALESCE((SELECT MAX(id) FROM audit_logs), 1),
      EXISTS (SELECT 1 FROM audit_logs)
    )
  `);
}

async function main() {
  const arguments_ = parseArguments(process.argv.slice(2));
  if (arguments_.help) {
    usage();
    return;
  }
  if (!unpooledDatabaseUrl) throw new Error("STORAGE_DATABASE_URL_UNPOOLED is required.");

  const sqlitePath = resolve(arguments_.sqlitePath);
  await access(sqlitePath);
  const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
  const source = readSource(sqlite);
  sqlite.close();

  const pool = new Pool({
    connectionString: unpooledDatabaseUrl,
    max: 1,
    allowExitOnIdle: true,
    application_name: "noortetugi-staff-sqlite-import"
  });
  const client = await pool.connect();
  const totals = new Map();

  try {
    await ensureMigrations(client);
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["noortetugi_staff_sqlite_import"]);

    for (const definition of TABLES) {
      const counts = { inserted: 0, unchanged: 0 };
      for (const sourceRow of source.rowsByTable.get(definition.name)) {
        const result = await importRecord(client, definition, definition.map(sourceRow));
        counts[result] += 1;
      }
      totals.set(definition.name, counts);
    }

    if (arguments_.apply) await client.query("COMMIT");
    else await client.query("ROLLBACK");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the import error.
    }
    throw error;
  } finally {
    client.release();
  }

  if (arguments_.apply) await resetAuditIdentity(pool);
  await pool.end();

  for (const [table, counts] of totals) {
    console.log(`${table}: ${counts.inserted} new, ${counts.unchanged} already identical.`);
  }
  console.log(
    `${arguments_.apply ? "Import committed" : "Dry run rolled back"}; ` +
    "no existing target rows were overwritten."
  );
  if (source.skippedAuthState.sessions || source.skippedAuthState.oauthAttempts) {
    console.log("Local sessions and incomplete OAuth attempts were intentionally not imported; staff must sign in again.");
  }
  const localAttachmentCount = source.rowsByTable.get("attachments")
    .filter((row) => !row.blob_pathname || !row.blob_url).length;
  if (localAttachmentCount > 0) {
    console.log(
      `${localAttachmentCount} local attachment record(s) remain pending until their files are transferred to private Blob.`
    );
  }
}

main().catch((error) => {
  const message = String(error?.message || "unknown import error");
  const safeMessage = unpooledDatabaseUrl
    ? message.split(unpooledDatabaseUrl).join("[redacted]")
    : message;
  console.error(`SQLite import failed: ${safeMessage}`);
  process.exitCode = 1;
});
