# Noorte Tugi staff application on Vercel

## Submission finalization upgrade

News publication requires `submissions.published_at`, introduced in
`003_published_news.sql`. Expense/invoice submission and review no longer reference
that column. `002a_repair_duplicate_primary_attachments.sql` preserves legacy
attachments and demotes excess active primary metadata before migration 003 creates
the unique index. Run all migrations through `006_google_drive_archival.sql`
before promoting this release. Neither Vercel builds nor application startup run
database migrations automatically.

From the repository root in a trusted shell with the existing
`STORAGE_DATABASE_URL_UNPOOLED` available, run:

```sh
npm run db:migrate
npm run db:check
```

Do not print connection strings or load environment files into diagnostics.
The runner preserves checksummed history and applies each pending migration in
a transaction. Migration 004 repairs the published timestamp column, submission
status constraint, related indexes, and delivery lookup index without deleting
records. Migration 005 repairs a missing news timestamp/index even if 004 is
already recorded; it leaves unpublished timestamps NULL. Existing unique conflicts stop a migration safely; resolve conflicting
business records deliberately instead of resetting data or bypassing a constraint.

Deploy the checked revision after the migration. Then sign in, create/save/reopen
one test draft, upload/download a private attachment, submit, confirm one finance
notification and a submitted read-only record, and retry Submit to confirm no
second email. Provider credentials were not changed by this release.

The health endpoint checks the common submission schema. `db:check` additionally
checks news publication, Drive archive state, and all migration checksums. Missing operation-specific
schema stops processing before document preparation or SMTP. News publication
has its own preflight. Delivery markers remain durable
when finalization fails. A confirmed sent marker permits finalization retry; an
uncertain SMTP outcome requires the guarded procedure in
[DELIVERY-RECOVERY.md](DELIVERY-RECOVERY.md).

See [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) for local evidence and
remaining production checks, and [ENVIRONMENT-REVIEW.md](ENVIRONMENT-REVIEW.md)
for the variable-name-only review.

The optional server-side expense archive is documented in
[GOOGLE-DRIVE-ARCHIVE.md](GOOGLE-DRIVE-ARCHIVE.md). Apply migration 006 before
setting `GOOGLE_DRIVE_ARCHIVE_ENABLED=true`. Drive failures never replace or
cancel the established finance email and Blob storage paths.

The public site, `/admin`, and `/api/staff/*` are deployed from one Vercel
project and one origin: `https://www.noortetugi.ee`. Express runs as a Vercel
Function; the admin files are copied into the production static output by the
root build script.

## Safety and assumptions

- Database migrations are additive and run only through the explicit
  `db:migrate` command. Application startup and the Vercel build do not run
  migrations.
- The SQLite import commands never delete the source database or upload
  directory and never overwrite conflicting Postgres rows.
- Existing sessions and unfinished OAuth attempts are intentionally not
  imported. Staff sign in again after migration.
- Blob transfer is a separate explicit step after SQLite rows are imported.
- Take a Neon backup and a copy of the SQLite database/uploads before an
  import. Test both import commands with `--dry-run` first.
- Use Node.js 22.5 or newer. No Google passwords belong in this project.

## Vercel resources

1. Connect this repository to the existing `www.noortetugi.ee` Vercel project.
   Keep the repository root as the project root. `vercel.json` supplies the
   build command, output directory, function settings, and admin headers.
2. Add a Neon Postgres integration from Vercel Marketplace and connect it to
   the project. Runtime Functions must receive the pooled
   `STORAGE_DATABASE_URL`; migration/import shells must receive the direct
   `STORAGE_DATABASE_URL_UNPOOLED` connection.
3. Create a **Private** Vercel Blob store and connect it to the same project.
   It must provide `BLOB_READ_WRITE_TOKEN` only to server-side Functions.
4. In Google Cloud, create an OAuth 2.0 Web Application client. Configure:
   - Authorized origin: `https://www.noortetugi.ee`
   - Authorized redirect URI:
     `https://www.noortetugi.ee/api/staff/auth/google/callback`
5. Add the required environment variables below to the Production
   environment. Apply equivalent non-production callback URLs only if preview
   OAuth is intentionally configured.

## Required Vercel environment variables

```text
STORAGE_DATABASE_URL
STORAGE_DATABASE_URL_UNPOOLED
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_CALLBACK_URL=https://www.noortetugi.ee/api/staff/auth/google/callback
APP_URL=https://www.noortetugi.ee
SESSION_SECRET
ALLOWED_GOOGLE_DOMAIN=noortetugi.ee
BLOB_READ_WRITE_TOKEN
FINANCE_NOTIFICATION_EMAIL=finance@noortetugi.ee
STAFF_SMTP_HOST=smtp.gmail.com
STAFF_SMTP_PORT=465
STAFF_SMTP_SECURE=true
STAFF_SMTP_REQUIRE_TLS=false
STAFF_SMTP_USER=staff@noortetugi.ee
STAFF_SMTP_PASSWORD=<Google App Password for STAFF_SMTP_USER>
STAFF_MAIL_FROM=Noorte Tugi <staff@noortetugi.ee>
```

`SESSION_SECRET` must contain at least 32 bytes of unpredictable data. Generate
one locally and paste it directly into Vercel; never commit it:

```bash
openssl rand -base64 48
```

Optional authorization variables:

```text
ALLOWED_STAFF_EMAILS
ADMIN_EMAILS
```

Optional expense archival variables are listed in
[GOOGLE-DRIVE-ARCHIVE.md](GOOGLE-DRIVE-ARCHIVE.md). Leave
`GOOGLE_DRIVE_ARCHIVE_ENABLED` absent or false until migration 006 and the
Drive folder permissions are configured.

Both are comma-separated exact `@noortetugi.ee` addresses. An empty
`ALLOWED_STAFF_EMAILS` allows every verified address in the configured domain.
New users receive `member`; only exact entries in `ADMIN_EMAILS` can receive
`admin` automatically. Existing non-admin roles are preserved.

### Expense email configuration

The expense recipient variable is exactly `FINANCE_NOTIFICATION_EMAIL`; there
is no `STAFF_MAIL_TO` variable. The recipient must be an address in
`ALLOWED_GOOGLE_DOMAIN`.

`STAFF_SMTP_USER` must be the complete Google Workspace mailbox that owns the
credential. Set `STAFF_SMTP_PASSWORD` to a Google App Password created for that
same account, not the account's normal password. The account must have 2-Step
Verification enabled and the Workspace policy must allow App Passwords. Paste
the generated 16-character value without display spaces, surrounding quotes,
or a trailing newline, and store it as a sensitive Production variable in
Vercel.

`smtp.gmail.com` defaults to port 465 with direct TLS (`STAFF_SMTP_SECURE=true`
and `STAFF_SMTP_REQUIRE_TLS=false`), but the explicit values above are
recommended for an auditable deployment. To use Gmail STARTTLS on port 587,
set `STAFF_SMTP_PORT=587`, `STAFF_SMTP_SECURE=false`, and
`STAFF_SMTP_REQUIRE_TLS=true` together. `STAFF_MAIL_FROM` must be the
authenticated mailbox or an alias that mailbox is authorized to send as.

`STAFF_SMTP_PASSWORD` is the canonical password name. `STAFF_SMTP_PASS` is a
temporary backwards-compatible fallback used only when the canonical variable
is absent; migrate it to `STAFF_SMTP_PASSWORD` and do not configure both. The
canonical variable always wins. `STAFF_MAIL_CONNECTION_TIMEOUT_MS` is optional
and defaults to 10000 milliseconds.

Vercel environment changes apply only to new deployments. After adding or
rotating any SMTP variable, create a new Production deployment before testing
the expense submission flow.

### Optional AI writing suggestions

Set `OPENAI_API_KEY` as a sensitive Production variable to enable the manual
writing-suggestion controls for supported prose fields. `OPENAI_MODEL` is
optional and defaults to `gpt-5-mini`. The user sees the original text and the
suggestion side by side, and the suggestion replaces the form field only after
the user explicitly accepts it.

Final expense submission never invokes AI or rewrites data using AI. When
`OPENAI_API_KEY` is absent, the normal expense submission flow remains fully
available without AI assistance. Amounts, dates, currencies, references,
payment details, identities, line items, attachments, and other structured or
financial fields are not AI-editable.

`PUBLIC_SITE_ORIGIN` remains optional for the existing public-site feature.

## First deployment

From the repository root:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Run the additive Postgres migrations with `STORAGE_DATABASE_URL_UNPOOLED`
present in the shell:

```bash
npm run db:migrate
```

Then deploy the same checked revision:

```bash
npx vercel@latest --prod
```

Verify these endpoints after deployment:

```text
https://www.noortetugi.ee/
https://www.noortetugi.ee/admin
https://www.noortetugi.ee/api/staff/health
https://www.noortetugi.ee/api/staff/auth/google
```

The health endpoint returns only application/database availability and no
connection details.

## Safe SQLite import

Run migrations first. With `STORAGE_DATABASE_URL_UNPOOLED` present, inspect the
complete import without committing changes:

```bash
cd staff-app
npm run db:import-sqlite -- --sqlite /absolute/path/staff.sqlite --dry-run
```

If every row is either new or byte-for-byte equivalent, apply it explicitly:

```bash
npm run db:import-sqlite -- --sqlite /absolute/path/staff.sqlite --apply
```

The row import leaves local attachment records hidden and `pending`. With both
`STORAGE_DATABASE_URL_UNPOOLED` and `BLOB_READ_WRITE_TOKEN` present, validate
all local files:

```bash
npm run db:import-sqlite-blobs -- \
  --sqlite /absolute/path/staff.sqlite \
  --uploads /absolute/path/uploads \
  --dry-run
```

Transfer them to Private Blob only after the dry run succeeds:

```bash
npm run db:import-sqlite-blobs -- \
  --sqlite /absolute/path/staff.sqlite \
  --uploads /absolute/path/uploads \
  --apply
```

The transfer revalidates file size, extension, declared MIME type, actual file
signature, and SHA-256. A failed Postgres update deletes the newly uploaded
Blob. Source files are never removed.

## Runtime storage behavior

- Browser uploads receive a short-lived pathname-scoped Private Blob `PUT`
  URL only after session, CSRF, submission, MIME, extension, and size checks.
- The browser never receives `BLOB_READ_WRITE_TOKEN`.
- After upload, the server downloads the private object, verifies its actual
  contents and hash, and only then marks the Postgres attachment ready.
- Downloads stream through the authenticated `/api/staff/attachments/:id/download`
  route.
- Permanent deletion records `delete_pending` before removing Blob, making
  interrupted cleanup retryable. Expired pending uploads are reconciled during
  later uploads and admin session bootstrap; admins can also call the protected
  `POST /api/staff/storage/reconcile` route.
