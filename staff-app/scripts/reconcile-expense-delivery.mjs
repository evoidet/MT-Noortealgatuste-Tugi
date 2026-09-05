import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";

import { safeOperationalError } from "../src/safe-errors.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const outcomes = new Set(["sent", "not-sent"]);

function reconciliationError(code, message) {
  return Object.assign(new Error(message), { code });
}

function validateOptions({ submissionId, outcome, apply = false }) {
  if (typeof submissionId !== "string" || !uuidPattern.test(submissionId) ||
      !outcomes.has(outcome) || typeof apply !== "boolean") {
    throw reconciliationError("INVALID_RECONCILIATION_ARGUMENTS",
      "Provide --submission UUID and --outcome sent|not-sent; --apply is optional.");
  }
  return { submissionId: submissionId.toLowerCase(), outcome, apply };
}

export function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!["--submission", "--outcome", "--apply"].includes(name) || values.has(name)) {
      throw reconciliationError("INVALID_RECONCILIATION_ARGUMENTS", "Unknown or repeated reconciliation option.");
    }
    if (name === "--apply") {
      values.set(name, true);
    } else {
      values.set(name, argv[++index]);
    }
  }
  return validateOptions({
    submissionId: values.get("--submission"),
    outcome: values.get("--outcome"),
    apply: values.get("--apply") ?? false
  });
}

// The caller supplies a dedicated direct connection. No environment is read and
// no provider is contacted when this function is imported or used by tests.
export async function reconcileExpenseDelivery(client, options) {
  const { submissionId, outcome, apply } = validateOptions(options);
  await client.query("BEGIN");
  try {
    const lock = await client.query(
      "SELECT pg_try_advisory_xact_lock(hashtext('staff-submission-submit'), hashtext($1)) AS acquired",
      [submissionId]
    );
    if (lock.rows[0]?.acquired !== true) {
      throw reconciliationError("SUBMISSION_IN_PROGRESS", "The submission is currently being processed.");
    }
    const submissionResult = await client.query(
      "SELECT id, type, status FROM submissions WHERE id = $1 FOR UPDATE NOWAIT",
      [submissionId]
    );
    const submission = submissionResult.rows[0];
    if (!submission) throw reconciliationError("SUBMISSION_NOT_FOUND", "The submission does not exist.");
    if (submission.type !== "expense" || !["DRAFT", "NEEDS_CHANGES"].includes(submission.status)) {
      throw reconciliationError("INVALID_WORKFLOW_STATE", "Only editable expense submissions can be reconciled.");
    }
    const latestResult = await client.query(`
      SELECT id, action, metadata_json ->> 'deliveryKey' AS delivery_key
      FROM audit_logs
      WHERE target_type = 'expense' AND target_id = $1
        AND action IN ('EXPENSE_NOTIFICATION_STARTED',
          'EXPENSE_NOTIFICATION_SENT', 'EXPENSE_NOTIFICATION_REJECTED')
        AND created_at > COALESCE(
          (SELECT MAX(created_at) FROM reviews
           WHERE submission_id = $1 AND decision = 'needs_changes'), '-infinity')
      ORDER BY id DESC LIMIT 1
    `, [submissionId]);
    const latest = latestResult.rows[0];
    if (latest?.action !== "EXPENSE_NOTIFICATION_STARTED") {
      throw reconciliationError("DELIVERY_NOT_UNCERTAIN", "The current delivery is not awaiting reconciliation.");
    }
    if (typeof latest.delivery_key !== "string" || !latest.delivery_key.trim()) {
      throw reconciliationError("DELIVERY_KEY_MISSING", "The pending delivery marker has no delivery key.");
    }
    if (apply) {
      await client.query(`
        INSERT INTO audit_logs (
          user_id, email, action, target_type, target_id, metadata_json, created_at
        ) VALUES (NULL, NULL, $1, 'expense', $2, $3::jsonb, NOW())
      `, [
        outcome === "sent" ? "EXPENSE_NOTIFICATION_SENT" : "EXPENSE_NOTIFICATION_REJECTED",
        submissionId,
        JSON.stringify({ deliveryKey: latest.delivery_key, reconciliation: true })
      ]);
      await client.query("COMMIT");
    } else {
      await client.query("ROLLBACK");
    }
    return {
      submissionId,
      state: apply ? (outcome === "sent" ? "sent" : "ready") : "uncertain",
      outcome,
      applied: apply
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Closing the dedicated connection also releases its transaction lock.
    }
    throw error;
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const connectionString = process.env.STORAGE_DATABASE_URL_UNPOOLED;
  if (!connectionString) {
    throw reconciliationError("STORAGE_DATABASE_URL_UNPOOLED_REQUIRED",
      "STORAGE_DATABASE_URL_UNPOOLED is required.");
  }
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 10_000,
    application_name: "noortetugi-staff-delivery-reconciliation"
  });
  try {
    await client.connect();
    const result = await reconcileExpenseDelivery(client, options);
    console.log("Expense delivery reconciliation:", result);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error("Expense delivery reconciliation failed:", safeOperationalError(error));
    process.exitCode = 1;
  });
}
