# Noorte Tugi staff application on Vercel

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

Both are comma-separated exact `@noortetugi.ee` addresses. An empty
`ALLOWED_STAFF_EMAILS` allows every verified address in the configured domain.
New users receive `member`; only exact entries in `ADMIN_EMAILS` can receive
`admin` automatically. Existing non-admin roles are preserved.

Optional existing features continue to use the `OPENAI_*`, `PUBLIC_SITE_ORIGIN`,
`FINANCE_NOTIFICATION_EMAIL`, and `STAFF_SMTP_*` variables listed with blank
values in `.env.example`.

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
