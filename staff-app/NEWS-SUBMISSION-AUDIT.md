# News submission audit — 2026-09-16

## Findings and root cause

The exact fate of the colleague’s submission cannot be established without its production record/logs. The shell did not have a production database connection available; no secret files were opened or searched. No existing production records were changed or deleted.

Confirmed defects:

1. Final server validation required summary, author, date and slug as well as title/body. The browser required those fields too. Incomplete final submission could leave an already saved `DRAFT`, which correctly does not appear in the reviewer queue or public site.
2. Both the public API and browser catalogue filtered out published articles with an empty excerpt. Changing form validation alone would therefore still hide summary-free articles. The new real-database integration regression reproduced this server-side visibility failure before the second filter was fixed.
3. The local image helper saved a browser-selected local file and stored an assumed deployed asset path. It previously relied on a separate manual deployment. It now queues the prepared image for the existing Blob upload when saving the article, and does not persist the local-only path for newly prepared images.
4. Frontend update/submit code could fall back to the old draft on an invalid success response, then show success. It now requires the saved ID and, for final submission, a matching ID and completed workflow status.
5. A transient upload-completion failure could lead a retry to request a new primary image upload. The client now retries completion of the already uploaded file in the same editor session.

## Fields

All form fields originate in `public/app.js` (`newsForm`, `localNewsImageField`, `collectNewsData`). `src/validation.js` validates persisted input. Text/metadata are stored in `submissions.data_json`; image records are in `attachments`. Drafts remain allowed to be incomplete.

| Form field | Final submission | Reason / default |
|---|---|---|
| Pealkiri / title | Required | Identifies and displays the article |
| Sisu / article text | Required | The article must contain nonblank content |
| Slug / URL identifier | Optional | Server uses `news-<submission UUID>` when omitted; supplied slugs remain validated and unique |
| Date | Optional | Server supplies the UTC submission date when omitted |
| Category | Optional | Existing UI selection retained; API omission defaults to `events` |
| Project | Optional | Descriptive metadata |
| Registration URL | Optional | Only articles with registration need it; supplied URLs validated |
| Author | Optional | Public byline; authenticated creator is independently recorded |
| Author role | Optional | Descriptive byline metadata |
| Kokkuvõte / summary | Optional | Empty remains empty; no generated summary |
| Image URL | Optional | Article works without an image; supplied URL validated |
| Image alternative text | Optional | Descriptive image metadata |
| Image position | Optional | Defaults to `center center` |
| Image fit | Optional | Defaults to `cover` |
| Main image upload | Optional | Existing private Blob upload |
| Additional images | Optional | Existing private Blob attachments |
| Local image / prepared image | Optional | Local copy plus persistent main-image upload when article is saved |
| Featured | Optional | Defaults to false |

Top-level optional news values accept omitted, undefined, null and empty-string input. Unknown keys still fail strict validation. Language/translations are retained by the editor; paragraph breaks, Unicode, quotes, registration links and metadata survive persistence/publication. Existing text length, URL, date and image format limits remain.

## Exact persistence and publishing flow

1. Authenticated staff use the existing Google session and CSRF-protected API.
2. Save/Submit first POSTs `/api/staff/submissions` or PATCHes the existing ID. The database transaction stores the JSONB article, owner, DRAFT status and revision. The create response is HTTP 201 with an ID only after transaction commit.
3. Optional uploads use upload-intent → presigned private Blob PUT → completion. Completion verifies the uploaded bytes and records ready attachment metadata. The prepared local image now follows this same flow. Failed uploads retain the draft and preview for retry and cannot report submission success.
4. POST `/api/staff/submissions/:id/submit` validates title/body and URLs, fills missing slug/date, generates the public article, and directly commits `published-news.json` to GitHub `main` through the server-side Contents API.
5. GitHub must confirm the commit before the database transaction changes the article to `PUBLISHED`. A retry after a later database failure is idempotent and does not duplicate the article.
6. `news-data.js` loads `/published-news.json` from the deployed repository build and merges it with the legacy repository catalogue. PostgreSQL is no longer a public article-content API.
7. Published image URLs use `/api/staff/public/news/<submission ID>/attachments/<attachment ID>`, which streams private Blob bytes only for published news. Images remain private before publication.

No permanent serverless filesystem writes are used. PostgreSQL retains workflow and history, Blob retains images, and GitHub is the public content source. See [NEWS-PUBLISHING.md](NEWS-PUBLISHING.md).

AI improvement remains a separately requested enhancement. Submission never invokes AI, SMTP or Drive archival. Existing AI error handling and provider tests remain in place.

## Previous submission / recovery

No previous submission could be identified from the available repository data. Production PostgreSQL, Blob inventory and deployment logs were not accessible from this shell. This is not evidence that the article was lost.

Check the employee’s own news list first for DRAFT or NEEDS_CHANGES, then the reviewer queue for SUBMITTED/UNDER_REVIEW. Published records with empty summaries become visible after this fix. A local-only image from an earlier submission must be uploaded again if it was never deployed; the server cannot recover a file that exists only on the employee’s computer.

An authorized operator can inspect records without modifying them:

```sql
SELECT id, status, creator_id, created_at, updated_at,
       data_json ->> 'title' AS title
FROM submissions
WHERE type = 'news'
ORDER BY updated_at DESC;
```

For the identified ID, inspect its revisions, reviews, attachments (including pending status), and audit logs. Preserve all records while investigating. Drafts being absent from the review queue is intentional access/workflow behavior.

## Environment variable names only

Repository publication adds `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, and `GITHUB_BRANCH`; `GITHUB_API_URL` is optional.

Feature/runtime: `APP_URL`, `GOOGLE_CALLBACK_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `STORAGE_DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`.

Role/domain and optional settings: `ADMIN_EMAILS`, `ALLOWED_GOOGLE_DOMAIN`, `ALLOWED_STAFF_EMAILS` (legacy alias `STAFF_ALLOWED_EMAILS`), `STAFF_MAX_UPLOAD_MB`, `PUBLIC_SITE_ORIGIN`.

Optional AI: `OPENAI_API_KEY`, `OPENAI_MODEL`.

Existing shared application startup also requires `FINANCE_NOTIFICATION_EMAIL`, `STAFF_MAIL_FROM`, `STAFF_SMTP_HOST`, `STAFF_SMTP_USER`, `STAFF_SMTP_PASSWORD` (legacy alias `STAFF_SMTP_PASS`). News does not send mail, but this existing common startup configuration is unchanged. Maintenance scripts use `STORAGE_DATABASE_URL_UNPOOLED`.

## Changed files

- `src/validation.js`: optional news normalization and essential-field checks.
- `src/app.js`: server defaults and public feed accepts empty summaries.
- `src/news-publishing.js`: safe empty excerpt and legacy identifier/date fallbacks.
- `public/app.js`: optional form controls, persistent prepared-image queue, strict saved/submitted response checks.
- `public/api.js`: retry uploaded-image completion without a duplicate upload.
- `public/staff-translations.js`: accurate local-image upload instructions in ET/EN/RU.
- `../news-data.js`: public catalogue accepts empty summaries.
- Tests: `test/validation.test.js`, `test/schema.integration.test.js`, `test/public-news.test.js`, `test/ui.test.js`, `test/news-api.test.js`, `test/news.browser.mjs`, `test/news-local-image.browser.mjs`.
- This audit report.

The unrelated concurrent change to root `index.html` was not made or reverted by this audit.

## Verification

Commands from the repository root, using Node 22.23.2 in WSL for package checks:

```sh
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
```

Browser checks use the bundled Playwright package (`NODE_PATH`) and installed Chrome (`BROWSER_CHANNEL=chrome`):

```sh
node staff-app/test/news.browser.mjs
node staff-app/test/news-local-image.browser.mjs
```

The integration trace uses the real PostgreSQL-compatible PGlite engine, migrations, database repository, sessions, CSRF checks and HTTP handlers. It verifies 201 + UUID creation, data read through another repository instance, HTTP 200 submission, reviewer visibility, approval, PUBLISHED persistence and public API output. Omitted/empty/null summary variants, other omitted fields, Unicode, quotes, multiline/long content, all metadata, authorization, schema failure, missing essential content and database failure are covered. Browser tests exercise the real editor/public scripts with synthetic provider/API responses; they do not write production data. Storage tests cover image signature validation, private Blob options, completion failures and cleanup.

Final results:

| Check | Result |
|---|---|
| `npm test` | 232 passed, 0 failed, 0 skipped |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed; public and admin assets generated in `dist/` |
| `git diff --check` | Passed |
| `node staff-app/test/news.browser.mjs` | Passed: 12 news editor cases, 24 existing finance regression cases, 6 public-page cases, across ET/EN/RU and mobile/desktop widths |
| `node staff-app/test/news-local-image.browser.mjs` | Passed: image decoding/conversion checks and 6 local preparation → persistent upload workflows |

An initial browser launch using Edge was unavailable on this machine; both browser scripts completed using installed Chrome. Production provider availability and the colleague’s historical submission remain unverified.

## Manual production test after deploying

1. Sign in as a normal authorized employee. Enter only title/body, including õ ä ö ü š ž, quotes and multiple paragraphs. Clear summary/author/date/slug; leave images empty.
2. Open preview, confirm submission, and verify a completed confirmation. Reload the employee list and open the saved article. Check the returned ID and `SUBMITTED` status in the network response.
3. Sign in as another authorized reviewer. Find the same ID in the review queue and approve. Reload and verify `PUBLISHED`.
4. Open the public news API, homepage and article URL after the feed cache refreshes. Verify body text and the absence of a generated summary.
5. Repeat with JPEG/PNG/WebP upload and with the local preparation helper (including GIF/BMP conversion). Verify upload-intent, PUT, completion, and a working public image after approval/reload.
6. Exercise a controlled failed request in browser developer tools. Verify an error, retained input/draft, no success screen, and a successful retry without duplicate image uploads.
7. Search the original colleague’s own drafts and the reviewer queue before attempting any recovery or resubmission.
