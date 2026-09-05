# Submission and News production readiness — 2026-09-05

## Root cause

News, expense reports and invoices share `submissions`; there is no second news table.
Migration 001 defined the common status/timestamp/revision columns. Migration 002
added Google identity and private attachment metadata. Migration 003 added nullable
`published_at TIMESTAMPTZ`, the PUBLISHED status and publication/attachment indexes.
Migration 004 already attempted a timestamp/index/status repair.

The old common preflight and final UPDATE referenced `published_at` even for expense
reports. PostgreSQL resolves every column in a CASE expression, including its unused
branches, so a database without this column returned 42703 before or after sending.
The reported logs establish the missing column, but do not distinguish an unapplied
migration from schema drift. The live migration ledger could not be inspected.
The SSL warning was unrelated; connection configuration is unchanged.

## Database deployment

The explicit db:migrate runner uses an advisory lock, checksummed migration history
and a transaction for each pending version. Startup/build do not run migrations.
Historical migrations 001–004 are unchanged. New version 005 repairs the timestamp
and its publication index even when an installation already records 004:

```sql
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS submissions_published_news_idx
  ON submissions (published_at DESC, updated_at DESC)
  WHERE type = 'news' AND status = 'PUBLISHED';
```

There is no default or NOT NULL constraint: drafts remain NULL. No rows, attachments,
or tables are deleted or recreated. Repeated execution is tested. Apply all pending
versions from the existing configured deployment shell:

```sh
npm run db:migrate
npm run db:check
```

Both commands were attempted locally. The current shell did not provide
STORAGE_DATABASE_URL_UNPOOLED; this says nothing about the Vercel configuration.
No environment files were read. The production migration and deployment remain pending.

## Submission path and SQL audit

Authentication/domain/allowlist, session and CSRF enforcement remain unchanged.
The submit route loads the owner's draft and acquires the existing transaction-scoped
advisory lock. A completed retry returns the already final record. Common preflight
compiles zero-row probes for the tables below, independently of news publication.
Final validation normalizes data, checks required expense attachments and persists
changed data/revisions. DOCX generation validates the template result; private files
are materialized before SMTP. Durable started/sent/rejected delivery markers retain
the existing retry and ambiguity protections. Only completed required stages reach
transactional status/revision persistence: expenses SUBMITTED, invoices APPROVED.
Confirmed delivery skips another email on retry; uncertain delivery requires the
existing DELIVERY-RECOVERY.md procedure.

Queries in this path use these established schema contracts:

| Repository operations | Tables and columns | Origin |
| --- | --- | --- |
| getSubmission, updateSubmission, setSubmissionStatus | submissions: id, type, creator_id, status, data_json, revision_no, created_at, updated_at, submitted_at; users: id, email, name | 001 |
| draft and final revision INSERTs | revisions: id, submission_id, revision_no, data_json, event, created_by, created_at | 001 |
| listAttachments and response metadata | attachments: id, submission_id, uploader_id, storage_name, original_name, mime_type, kind, size_bytes, sha256, created_at | 001 |
| private attachment state | storage_status, blob_pathname, blob_url, storage_updated_at | 002 |
| delivery state and audit writes | audit_logs: id, user_id, email, action, target_type, target_id, metadata_json, ip_hash, created_at | 001 |
| delivery review-cycle boundary and response reviews | reviews: id, submission_id, reviewer_id, decision, comment, created_at; users: id, email, name | 001 |

All values remain parameterized; dynamically composed SQL uses fixed internal clauses
and identifiers only. Neither finance status updates nor finance reviews contain the
publication column. Schema errors log submissionId, stage, operation, table and safe
PostgreSQL column/code diagnostics. API responses do not return raw SQL errors.

## News workflow

All authenticated permitted members can create, save incomplete drafts, reopen/edit,
upload images, preview and submit their own news. Desktop and mobile have Uudised /
Новости / News navigation next to the existing expense feature. The existing editor,
private Blob upload/download, manual AI correction and escaped preview are reused.
AI only changes text after the user explicitly accepts a suggestion.

Members submit to SUBMITTED; administrators review and approve another author's
article to PUBLISHED. Existing administrator direct publication of their own article
is retained. Publication alone runs the news-specific preflight and writes its first
publication timestamp. Members cannot publish, review finance, create invoices, or
read other authors' drafts through API manipulation.

The existing news data_json model supplies slug, title, summary/excerpt, content,
date, category, author, images and translations. The editor now preserves language
and stored translations during saves. Estonian remains the default source. No new
translation service or automatic translation/publication is introduced.

The website previously read only news-data.js's static catalogue despite having a
public news API. news-data.js now merges the already localized PUBLISHED API items,
and news.js/news-home.js wait for that bounded request before rendering. Existing
static articles and their translations remain intact, including during API failure.
Public draft records and private draft images remain inaccessible.

## Every remaining published_at reference

- src/database.js: mapSubmission reads an optional row property (undefined maps to
  NULL without a SQL lookup); assertNewsPublicationSchema probes the news field;
  listPublishedNews orders published news; setSubmissionStatus and addReview append
  the timestamp clause only for news transitions to PUBLISHED.
- migrations/003_published_news.sql: original column, legacy exported-news timestamp
  conversion and index. migrations/004_submission_finalization.sql: previous repair
  and index. Both remain immutable historical migrations.
- migrations/005_news_publication_timestamp.sql: new idempotent column/index repair.
- test/schema.integration.test.js: reproduces the original CASE failure and removes
  the column only in isolated in-memory PostgreSQL fixtures to test finance isolation,
  safe publication failure and migration repair.
- test/database.test.js: synthetic mapped-row fixture.
- test/safe-errors.test.js: synthetic PostgreSQL diagnostic/redaction fixtures.
- DEPLOYMENT.md and this document: migration/root-cause/verification explanation.

## Verification and limits

Final results: all 143 Node tests passed; typecheck, lint, build and diff whitespace
checks passed. All 12 staff browser combinations (four widths × three languages)
and all three public-language scenarios passed with no JavaScript errors. Migration
005 is a new uncommitted working-tree file; it must be included with the release.

The Node test suite covers authentication, ownership, finance isolation, draft CRUD,
real DOCX generation, synthetic notification, durable retries, schema drift, repeat
migrations, News preview/submission/admin publication, public visibility, translation
preservation, public catalogue merging and fallback. PGlite executes real PostgreSQL
SQL with synthetic data; it does not exercise live Neon pooling. Existing separate
lock tests exercise concurrency contracts.

The optional test/news.browser.mjs uses Playwright with synthetic API responses and
only allowlisted public assets. It checks 320/390/768/1280px in ET/RU/EN, draft/save/
reopen, image upload, explicit AI acceptance, preview, validation, submit, account and
admin navigation, plus public home/article rendering. It checks descendant bounds
and 44px navigation tap targets; screenshots are inspected as well. This caught and
fixed the old 720px minimum news-preview width that clipped mobile content.

Run npm test, npm run typecheck, npm run lint, npm run build and git diff --check.
For browser verification, provide Playwright through normal module resolution or
NODE_PATH and run node staff-app/test/news.browser.mjs (optional BROWSER_CHANNEL and
BROWSER_SCREENSHOT_DIR). No browser dependency is added to production bundles.

Live Google login, actual Blob upload, SMTP receipt, migration and deployment still
need the existing production environment. No real notification was sent locally.
No credentials, environment files, OAuth, SMTP, Blob, sessions or TLS configuration
were changed or exposed.
