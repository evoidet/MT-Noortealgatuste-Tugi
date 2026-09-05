# Staff submission production-readiness verification

## Root cause and evidence

`POST /api/staff/submissions/:id/submit` invokes `database.setSubmissionStatus`
during `stage: finalize`. Its `UPDATE submissions` references
`submissions.published_at` for every submission type, including expenses.
PostgreSQL resolves that column even when the conditional target status is not
`PUBLISHED`.

Migration `001_initial_postgres.sql` creates the other finalization columns.
Migration `002_google_identity_and_private_blob.sql` adds Google identity and
private attachment fields. `003_published_news.sql` adds `published_at`, permits
`PUBLISHED`, converts exported news to published news, and creates these indexes:

- `submissions_news_slug_unique`
- `attachments_one_primary_per_submission`
- `submissions_published_news_idx`

The reported error is reproduced by executing the actual finalization query
against a synthetic PostgreSQL database with only migrations 001 and 002. It
returns `42703` for `published_at`; the failed transaction preserves the draft
and its revisions. Applying 003 and 004 makes the same query succeed. The test
also repairs a database with recorded migration history but a missing column,
then repeats 004 without changing existing submission records.

The repository's migration runner maintains checksummed `schema_migrations`
history. Vercel deployment/startup does not run it. Production therefore has a
schema predating 003 or equivalent schema drift, according to the supplied error
and reproduced code path. The exact live migration ledger was not inspected.
The read-only `db:check` command was attempted but the current shell did not
provide `STORAGE_DATABASE_URL_UNPOOLED`. This is not evidence that the Vercel
configuration is missing or incorrect. No environment files were opened.

## Implemented changes

| Files | Result |
| --- | --- |
| `migrations/004_submission_finalization.sql` | Additive timestamp repair, complete status constraint, related unique/publication indexes, indexed durable delivery-state lookups; no deleted records or edited historical migration checksums |
| `src/database.js`, `src/vercel.js` | Preflight checks, correct final timestamps for direct invoice/news confirmation and news review, transaction-scoped submission locks, separate lock/work connection capacity, safe connection failures |
| `src/app.js` | Schema checked before email; durable started/sent/rejected audit markers; safe retries; pending-delivery edit protection; serialized draft/attachment/review mutations; safe malformed/oversized JSON responses; safer upload completion cleanup |
| `src/safe-errors.js`, `scripts/db-migrate.mjs`, `scripts/db-check.mjs` | Safe PostgreSQL code/name/message/table/column/constraint diagnostics and read-only schema/checksum verification; no raw error detail, parameters, data, credentials or provider response bodies |
| `scripts/reconcile-expense-delivery.mjs`, `DELIVERY-RECOVERY.md` | Guarded dry-run recovery and explicit application of a manually confirmed uncertain delivery outcome; no email sending |
| `src/auth.js`, `src/config.js` | Existing-session domain/allowlist/admin-policy enforcement; strict TTL/proxy/model validation; required production sender variable; safe name-only configuration errors |
| `src/storage.js`, attachment routes | File type/signature/size/private storage checks, safe malformed-file errors and Unicode filenames, 100 attachment limit, ownership checks, retry-safe completion and durable cleanup |
| `src/documents.js`, `src/validation.js` | Accepted field lengths/mappings align with DOCX preparation, invoice rounding agrees with saved totals, template errors cannot print document values |
| `src/mail.js` | Existing sender/authenticated-user/recipient variable roles retained; only materialized attachments accepted; implicit filesystem/URL reads disabled |
| `public/app.js`, `public/styles.css`, `public/staff-translations.js` | Request-state controls, language changes preserve unsaved fields/files, persistent safe delivery messages, mobile document/table layout fixes |
| Root/workspace `package.json`, root `package-lock.json`, `test/*.test.js` | Maintenance commands and repeatable regression/integration coverage; PGlite is a development-only PostgreSQL test dependency |

The pooled-lock change follows Neon's documented transaction-pooling
limitations: session-level advisory locks are unsupported on pooled connections.
See [Neon connection pooling](https://neon.com/docs/connect/connection-pooling).
Both connection pools are registered for the Vercel runtime lifecycle.

## Complete system check

PASS/FIXED below describe local tests and source review. WARNING identifies a
specific production-only action still required.

| Area | Status | Evidence or remaining action |
| --- | --- | --- |
| Authentication | WARNING | Valid/invalid OAuth callback, browser binding, nonce, issuer, audience and expiration tests pass; perform one real production Google login/callback |
| Authorization | FIXED | Exact domain/allowlist and current admin restrictions apply server-side, including active sessions; ownership and cross-submission rejection covered |
| Sessions | FIXED | Hashed-token persistence, expiration and CSRF checks pass; revoked access is enforced on existing sessions |
| Draft creation | PASS | Actual HTTP/API creation against synthetic PostgreSQL returns a UUID and persists initial revision |
| Draft saving | FIXED | Save/reopen and unchanged retries tested; concurrent controls and delivered-draft edits protected |
| Database schema | WARNING | 42703 reproduced and repaired locally; run production migrations and `db:check` |
| Attachment upload | WARNING | Type/extension/signature/size/private-grant/ownership/cleanup tests pass; verify live private Blob upload and authorized download |
| Document preparation | FIXED | Real DOCX generation succeeds with valid API data, supported long fields and mapped metadata; preparation errors remain safe |
| Submission validation | FIXED | Required fields, dates, amounts, malformed input and document consistency tests pass |
| Email notification logic | WARNING | Sender, SMTP user, destination, attachments, failures and retries tested with injected transport; confirm one real finance receipt |
| Finalization | FIXED | Actual PostgreSQL transition/revisions/timestamps and reopened submitted state pass; deployed effect depends on migration |
| Duplicate-submit protection | FIXED | Lock contention, completed retry, status-write failure, marker failures, SMTP ambiguity and recovery tested; confirmed delivery skips another email |
| Mobile UI | FIXED | Real Chrome at 1440/768/390px for news/expense/invoice; errors, long filenames, loading, language changes, retries and read-only success states checked |
| Security review | FIXED | Server access control, CSRF, private attachments, parameterized SQL, safe errors, inert XSS tests and server-only configuration checked |
| Production build | PASS | Repository `npm run build` succeeds; hosted deployment was not performed |

Exactly-once delivery cannot be established from an SMTP timeout alone. The
system persists a marker before sending and stops automatic retries on ambiguity.
An administrator must confirm receipt/non-delivery and follow the recovery
runbook. For attempts made by the previous release, inspect existing delivery
evidence before retrying an old failed submission; a historical sent marker is
recognized, but missing historical evidence cannot prove non-delivery.

## Verification performed

- Node.js 22: all 139 tests pass, including five PostgreSQL/PGlite integration
  cases. The tests use isolated synthetic data; no production database is used.
- The HTTP integration case uses actual session/draft/revision/attachment metadata
  queries and real DOCX generation, with SMTP and Blob content reads replaced by
  synthetic in-memory implementations. PGlite is single-connection, so pooled
  concurrency is covered by a separate executable lock-contract test, not a live
  Neon load test.
- `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`
  pass. This repository's lint command is its syntax/site validation gate.
- Headless Chrome used synthetic API responses. It reported no JavaScript errors
  across desktop, tablet and mobile cases, including pending/uncertain delivery
  behavior and unobscured error messages. Representative screenshots were
  visually inspected.
- Live Google, Neon, Blob, SMTP and optional AI provider acceptance remain
  production verification. No real email was sent and no deployment was created.

## Environment review exceptions

- `PUBLIC_SITE_ORIGIN`: accepted and validated for compatibility, but has no
  current runtime consumer.
- `STORAGE_DATABASE_URL_UNPOOLED`: required by the migration/check shell; that
  variable was unavailable to this task's command environment. Use the existing
  trusted configured environment, without displaying its value.

No requested variable remains missing code-side validation, incorrectly named,
or exposed in browser modules. Compatibility aliases `STAFF_ALLOWED_EMAILS` and
`STAFF_SMTP_PASS` remain supported, with canonical names taking precedence.
The complete name-only matrix is in `ENVIRONMENT-REVIEW.md`. Deployed provider
acceptance is tested through the production smoke flow, not by exposing settings.

## Deployment actions

1. Commit/push the reviewed changes. Before promoting the new production release,
   run `npm run db:migrate` then `npm run db:check` from the repository root in
   the trusted environment with `STORAGE_DATABASE_URL_UNPOOLED` configured.
2. Deploy that same revision to Vercel. Migration execution is manual; neither
   the build nor application startup performs it.
3. Perform one production Google login and test expense flow: create/save/reopen,
   private upload/download, valid document preparation, submit, confirm one email,
   reopen as submitted, and verify a repeated Submit produces no duplicate email.
