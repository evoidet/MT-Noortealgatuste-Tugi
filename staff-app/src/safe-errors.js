// Never serialize arbitrary database/SMTP errors: detail, query, parameters,
// response and cause may contain submitted data or credentials.
const identifier = /^[a-z_][a-z0-9_]{0,62}$/;
const knownTables = new Set([
  "users", "sessions", "oauth_attempts", "submissions", "revisions",
  "reviews", "attachments", "audit_logs", "schema_migrations"
]);

function safeIdentifier(value) {
  return typeof value === "string" && identifier.test(value) ? value : undefined;
}

export function safeOperationalError(error, fallback = "OPERATION_FAILED") {
  const code = typeof error?.code === "string" && /^[A-Z0-9_]{1,80}$/.test(error.code)
    ? error.code : fallback;
  /** @type {{code: string, name: string, message?: string, table?: string, column?: string, constraint?: string, command?: string, responseCode?: number}} */
  const result = {
    code,
    name: ["Error", "error", "DatabaseError", "DocumentValidationError", "ZodError"].includes(error?.name)
      ? error.name : "Error"
  };
  if (/^(?:[0-5][0-9A-Z]|HV|P0|XX)[0-9A-Z]{3}$/.test(code)) {
    // Reconstruct PostgreSQL diagnostics from safe identifiers. Raw messages
    // for data/type/constraint failures can echo entire user-supplied values.
    const columnMatch = code === "42703"
      ? /^column "([a-z_][a-z0-9_]{0,62})"(?: of relation "([a-z_][a-z0-9_]{0,62})")? does not exist$/.exec(error?.message || "")
      : null;
    const table = safeIdentifier(error?.table) || columnMatch?.[2];
    const column = safeIdentifier(error?.column) || columnMatch?.[1];
    const constraint = safeIdentifier(error?.constraint);
    if (table && knownTables.has(table)) result.table = table;
    if (column) result.column = column;
    if (constraint) result.constraint = constraint;
    result.message = code === "42703" && column
      ? `column "${column}"${result.table ? ` of relation "${result.table}"` : ""} does not exist`
      : ({
          "23505": "duplicate key violates a unique constraint",
          "23503": "foreign key constraint violation",
          "23502": "null value violates a not-null constraint",
          "23514": "check constraint violation",
          "42P01": "required database relation does not exist",
          "22P02": "invalid input syntax (value redacted)",
          "40001": "transaction serialization failure",
          "40P01": "database deadlock detected"
        }[code] || "PostgreSQL operation failed (message redacted)");
  }
  if (typeof error?.command === "string" && /^[A-Z][A-Z0-9 -]{0,39}$/.test(error.command)) {
    result.command = error.command;
  }
  if (Number.isSafeInteger(error?.responseCode)) result.responseCode = error.responseCode;
  return result;
}
