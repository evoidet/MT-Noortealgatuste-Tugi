import { access, readFile, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openDatabase } from "../src/database.js";
import {
  persistUploadedFileWithRecord,
  validateUploadedFile
} from "../src/storage.js";

const unpooledDatabaseUrl = String(process.env.STORAGE_DATABASE_URL_UNPOOLED ?? "").trim();
const blobReadWriteToken = String(process.env.BLOB_READ_WRITE_TOKEN ?? "").trim();
const maxUploadMb = Number.parseInt(process.env.STAFF_MAX_UPLOAD_MB ?? "15", 10);
const config = Object.freeze({
  blobReadWriteToken,
  maxUploadBytes: (Number.isSafeInteger(maxUploadMb) && maxUploadMb > 0 ? maxUploadMb : 15) * 1024 * 1024,
  production: true
});

function usage() {
  console.log(`Usage:
  node scripts/import-sqlite-blobs.mjs --sqlite <path> --uploads <directory> --dry-run
  node scripts/import-sqlite-blobs.mjs --sqlite <path> --uploads <directory> --apply

Run the SQLite row import first. This command validates every local file,
uploads only pending attachment rows to PRIVATE Vercel Blob, never deletes the
SQLite database or local files, and compensates failed Postgres updates by
deleting the newly uploaded Blob.`);
}

function parseArguments(argv) {
  const parsed = { sqlitePath: "", uploadsPath: "", apply: false, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (argument === "--sqlite" || argument === "--uploads") {
      const value = argv[index + 1] || "";
      if (argument === "--sqlite") parsed.sqlitePath = value;
      else parsed.uploadsPath = value;
      index += 1;
      continue;
    }
    if (argument === "--apply") parsed.apply = true;
    else if (argument === "--dry-run") parsed.dryRun = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!parsed.sqlitePath || !parsed.uploadsPath) {
    throw new Error("--sqlite <path> and --uploads <directory> are required.");
  }
  if (parsed.apply === parsed.dryRun) throw new Error("Choose exactly one of --dry-run or --apply.");
  return parsed;
}

function containedUploadPath(root, storageName) {
  const pathname = resolve(root, String(storageName || ""));
  if (pathname !== root && !pathname.startsWith(`${root}${sep}`)) {
    throw new Error("An attachment storage name resolves outside the uploads directory.");
  }
  return pathname;
}

function sourceAttachments(sqlite) {
  return sqlite.prepare(`
    SELECT a.id, a.submission_id, a.uploader_id, a.storage_name,
           a.original_name, a.mime_type, a.size_bytes, s.type AS submission_type
    FROM attachments AS a
    JOIN submissions AS s ON s.id = a.submission_id
    ORDER BY a.created_at, a.id
  `).all();
}

async function loadAndValidateFile(row, uploadsRoot) {
  const pathname = containedUploadPath(uploadsRoot, row.storage_name);
  await access(pathname);
  const details = await stat(pathname);
  if (!details.isFile() || details.size !== Number(row.size_bytes)) {
    throw new Error("A local attachment is missing or its size no longer matches SQLite metadata.");
  }
  const buffer = await readFile(pathname);
  const file = {
    buffer,
    originalname: row.original_name,
    mimetype: row.mime_type
  };
  await validateUploadedFile({
    config,
    submission: { type: row.submission_type },
    file
  });
  return file;
}

function assertTargetMatches(row, target) {
  if (
    target.submissionId !== row.submission_id ||
    target.uploaderId !== row.uploader_id ||
    target.originalName !== row.original_name ||
    Number(target.size) !== Number(row.size_bytes)
  ) {
    throw new Error("A Postgres attachment row conflicts with the SQLite source; nothing was overwritten.");
  }
}

async function main() {
  const arguments_ = parseArguments(process.argv.slice(2));
  if (arguments_.help) return usage();
  if (!unpooledDatabaseUrl) throw new Error("STORAGE_DATABASE_URL_UNPOOLED is required.");
  if (!blobReadWriteToken && arguments_.apply) throw new Error("BLOB_READ_WRITE_TOKEN is required for --apply.");

  const sqlitePath = resolve(arguments_.sqlitePath);
  const uploadsRoot = resolve(arguments_.uploadsPath);
  await Promise.all([access(sqlitePath), access(uploadsRoot)]);
  const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
  const rows = sourceAttachments(sqlite);
  sqlite.close();

  const database = openDatabase(unpooledDatabaseUrl, { maxConnections: 1 });
  let ready = 0;
  let pending = 0;
  try {
    for (const row of rows) {
      const target = await database.getAttachment(row.id, { includePending: true });
      if (!target) throw new Error("A Postgres attachment row is missing; run db:import-sqlite first.");
      assertTargetMatches(row, target);
      if (target.storageStatus === "ready" && target.blobPathname && target.blobUrl) {
        ready += 1;
        continue;
      }
      if (target.storageStatus !== "pending" || target.blobPathname) {
        throw new Error("A Postgres attachment is not in a safe import state; nothing was overwritten.");
      }
      const file = await loadAndValidateFile(row, uploadsRoot);
      pending += 1;
      if (!arguments_.apply) continue;

      await persistUploadedFileWithRecord({
        config,
        submission: { type: row.submission_type },
        file,
        createRecord: async (stored) => {
          const updated = await database.markAttachmentReady(row.id, stored);
          if (!updated) throw new Error("The pending attachment changed during Blob import.");
          return updated;
        }
      });
    }
  } finally {
    await database.close();
  }

  console.log(
    `${arguments_.apply ? "Blob import completed" : "Blob import dry run completed"}: ` +
    `${pending} pending local file(s), ${ready} already ready.`
  );
}

main().catch((error) => {
  let message = String(error?.message || "unknown Blob import error");
  for (const sensitive of [unpooledDatabaseUrl, blobReadWriteToken]) {
    if (sensitive) message = message.split(sensitive).join("[redacted]");
  }
  console.error(`SQLite Blob import failed: ${message}`);
  process.exitCode = 1;
});
