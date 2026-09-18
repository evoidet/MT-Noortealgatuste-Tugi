# News end-to-end audit — 18 September 2026

## Result

Audited the editor, preview, optional AI, image preparation/upload, authenticated API, PostgreSQL schema/transactions, review/publication, public catalogue/article pages and Vercel build/runtime. Fixed the reproducible defects below and verified browser form-to-public-page workflows using the real application and database repository.

The repository already contained earlier fixes making summary/metadata optional and uploading prepared local images to Blob. Those were rechecked. This report supersedes the earlier audit's verification results. The original production incident cannot be attributed to a particular defect without its record/logs. No production deployment, production data mutation or secret-file access was performed.

## Root causes and problems fixed

1. **Duplicate drafts after lost create responses:** retried POSTs generated new IDs. Stable UUID idempotency keys now recover the committed article transactionally, check ownership and preserve revisions/status. The editor reapplies edits made after an uncertain save.
2. **Failed retries after successful submission:** a lost submit response led to PATCHing an already locked submission. The editor now reads persisted status and confirms completion before retrying edits or reporting success.
3. **Stranded primary image uploads:** a lost upload-intent response caused a new grant to collide with the existing pending primary attachment. Stable upload keys recover the original attachment/path; ready uploads are reused and normalized filenames compare consistently.
4. **Permissive API response parsing:** HTML could masquerade as successful API data; malformed JSON lost HTTP context. Responses now require valid JSON, saved/submitted IDs and expected completion state. Error bodies are not exposed. Attachment completion must identify the intended attachment; ambiguous failures retain retry state.
5. **Draft/final text mismatch:** strings allowed 30,000 characters, but normalized array paragraphs allowed only 6,000 each. Validation now accepts the same persisted representation on resubmission. The editor also enforces text limits and rejects whitespace-only required input before preview.
6. **Unrelated schema dependency:** News INSERT/UPDATE statements referenced finance reimbursement columns despite News preflight not requiring them. These columns are now used only for expense writes.
7. **A malformed legacy featured value broke the whole feed:** unsafe SQL boolean casts were replaced with safe comparisons.
8. **Legacy/source-language content disappeared or was replaced:** the public mapper handles string bodies, missing slug/category and invalid dates. Current source-language text wins over stale source translations; English originals are no longer replaced by Estonian fallback when English is requested.
9. **Older articles disappeared after 100 publications:** public results now load in pages, and published-only slug lookup supports direct links independently of listing pages. Tests include the 101st article in listing/search.
10. **Public failures looked like missing news:** deep links were discarded and loading errors hidden. URLs now remain intact, missing/unavailable states differ, and localized retry notices preserve static/previously loaded articles. Loading also works without `AbortSignal.timeout`.
11. **Stale public JSON delayed visibility:** the previous policy allowed several minutes of stale listings. Catalogue/detail JSON now uses `Cache-Control: no-store`; image caching remains unchanged.
12. **Metadata/gallery omissions:** project and author role now display in previews/public output and participate in search. Every ready additional image now renders; previously only the first was exposed publicly.
13. **Preview differed from publication:** primary-upload precedence and existing gallery images now match. Empty summaries are omitted, missing covers avoid empty `src` requests, and social metadata has sensible fallbacks.
14. **Invalid image references passed publication checks:** references must identify ready images owned by that submission with the appropriate primary/additional role. Reviewer approval now revalidates persisted content/references.
15. **Supported HTTPS image URLs were blocked by editor CSP:** its image policy now permits HTTPS images, matching field validation while retaining script restrictions.
16. **AI browser calls lacked a deadline:** the optional call now times out after 25 seconds; the provider retains its existing 20-second deadline with no automatic retries. Errors preserve original text and normal submission remains available.
17. **Extensionless News routing depended on hosting defaults:** explicit rewrites now support `/uudised` and `/uudised/`, retaining existing `.html` article URLs.

## End-to-end flow

`form → validation → optional AI/image processing → authenticated API → PostgreSQL/private Blob → submit/review → PUBLISHED → public API → listing/article`

1. Existing Google sessions, CSRF checks, ownership and permissions protect staff operations. AI runs only on request and suggestions apply only after user acceptance.
2. Preview saves/reopens a draft through POST/PATCH. Article JSON, owner, revision and status are committed to PostgreSQL. Stable create keys protect uncertain first saves.
3. Optional images use upload intent → direct browser PUT to private Blob → authenticated completion. Type/signature, size and checksum are verified before the attachment becomes ready. Prepared local images follow this same persistent path.
4. Submission validates stored title/body and image references, supplies missing slug/date, then commits final status under the existing submission lock. Failed finalization leaves a retryable draft.
5. Ordinary members become `SUBMITTED` and require approval by another authorized reviewer. Authorized News reviewers submitting their own article publish directly. Member submission success is not itself public publication; existing self-review restrictions remain.
6. Approval commits the review, `PUBLISHED` status and publication timestamp. Fresh paginated public data merges with the static catalogue. Direct lookup returns only published articles.
7. Permanent same-origin image URLs stream private Blob bytes only for published News. The website displays supplied metadata, body, cover and all additional images. Publishing an article requires no separate HTML file, Git commit or deployment.

## Required versus optional fields

| Field | Requirement / behavior |
|---|---|
| Title | Required and nonblank; maximum 180 characters |
| Article text | Required and nonblank; maximum 30,000 characters / 60 paragraphs |
| Summary/excerpt | Optional; maximum 600 characters; absence never hides the article |
| Slug | Optional; editor can suggest it, server falls back to `news-<ID>`; supplied values validated and database-unique |
| Date | Optional; server defaults to UTC submission date; supplied dates must be real ISO dates |
| Category | Optional, default `events`; existing categories retained |
| Author, author role, project | Optional; authenticated creator recorded separately |
| Registration URL | Optional validated HTTP(S) link |
| Cover URL/upload and additional images | Optional; direct JPEG/PNG/WebP uploads validated; existing browser conversion/preparation retained |
| Alt text, fit/position, featured, language/translations | Optional, existing defaults preserved |

Incomplete drafts remain saveable. Existing handling of omitted/null/empty optional top-level fields is preserved. Unknown fields and malformed supplied values remain rejected.

## Database, storage and Vercel

- Exercised all existing migrations on PostgreSQL-compatible PGlite, including older/drifted schemas. No migration was added or modified, and existing production records were untouched.
- Verified committed revisions/status/reviews, slug uniqueness, ownership, replay behavior, published-only queries and reads through a separate repository instance.
- Existing Vercel singleton runtime/lock pools use `attachDatabasePool`. Advisory locks are transaction-scoped for PgBouncer compatibility. SQL tests substitute local serialization for multi-connection advisory locking.
- Production image bytes remain in private Blob with PostgreSQL metadata. No durable News data depends on the temporary Vercel filesystem. Test fake Blob storage is isolated.
- Direct client uploads avoid the function body limit; the multipart fallback is capped at 4 MiB in production. JSON input is capped at 256 KiB; public listings now use smaller 25-article pages. See Vercel's [function limits](https://vercel.com/docs/functions/limitations), [direct-upload guidance](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions) and [private Blob documentation](https://vercel.com/docs/vercel-blob/private-storage).
- Function duration remains 60 seconds. Existing grants expire after 10 minutes; abandoned pending uploads are reconciled after 30 minutes. Unreferenced pending intents are not published.
- Production builds run existing migration/check scripts when `VERCEL_ENV=production`. Local build verification did not contact production infrastructure.

## Environment variables — names only

Derived from source code. No secret values/files were read. Existing shared application requirements remain unchanged.

| Required in production | Purpose / missing behavior |
|---|---|
| `APP_URL`, `GOOGLE_CALLBACK_URL` | Canonical HTTPS app and exact OAuth callback URLs; missing fails startup |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Staff authentication; missing fails startup |
| `SESSION_SECRET` | Session-related CSRF/logging secrets, at least 32 bytes; missing/short fails startup |
| `STORAGE_DATABASE_URL` | Runtime PostgreSQL; missing fails startup |
| `BLOB_READ_WRITE_TOKEN` | Private images/files; shared production startup requires it even for text-only News |
| `STORAGE_DATABASE_URL_UNPOOLED` | Production migration/schema checks; missing fails production build, not normal request configuration |
| `FINANCE_NOTIFICATION_EMAIL`, `STAFF_MAIL_FROM`, `STAFF_SMTP_HOST`, `STAFF_SMTP_USER`, `STAFF_SMTP_PASSWORD` | Existing shared finance setup; missing fails shared production startup. News itself sends no finance email. `STAFF_SMTP_PASS` is the legacy password alias |

| Optional / conditional | Purpose and missing behavior |
|---|---|
| `ADMIN_EMAILS` | Reviewer/admin authorization; without configured admins, submission can work but publication needs an authorized reviewer |
| `ALLOWED_GOOGLE_DOMAIN` | Defaults to `noortetugi.ee` |
| `ALLOWED_STAFF_EMAILS` / `STAFF_ALLOWED_EMAILS` | Additional allowlist; empty uses domain policy |
| `OPENAI_API_KEY` | Optional correction; absent hides AI controls, AI endpoint returns `AI_UNAVAILABLE`, normal submission works |
| `OPENAI_MODEL` | Defaults to `gpt-5-mini`; malformed supplied identifier fails configuration validation |
| `PUBLIC_SITE_ORIGIN` | Defaults to `APP_URL` |
| `STAFF_MAX_UPLOAD_MB` | Per-file size, default 15 MiB |
| `STAFF_SESSION_TTL_HOURS`, `STAFF_TRUST_PROXY`, `PORT` | Existing defaults: 12 hours, production trust 1, local port 3100 |
| `NODE_ENV`, `VERCEL_ENV` | Runtime/production build selection supplied by deployment conventions |
| `STAFF_ENABLE_DEV_AUTH` | Defaults false; forbidden in production |
| `STAFF_SMTP_PORT`, `STAFF_SMTP_SECURE`, `STAFF_SMTP_REQUIRE_TLS`, `STAFF_MAIL_CONNECTION_TIMEOUT_MS` | Shared mail tuning with existing defaults; not News delivery |
| `REIMBURSEMENT_RECIPIENTS` | Shared finance setup; built-in recipients for default domain, otherwise production configuration needs recipients |
| `GOOGLE_DRIVE_ARCHIVE_ENABLED` | Defaults false; News never archives to Drive. If enabled for finance, existing `GOOGLE_DRIVE_ROOT_FOLDER_ID`, `GOOGLE_DRIVE_INVOICE_FOLDER_ID`, `GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY` and `GOOGLE_DRIVE_USER_FOLDER_MAP` must validate |
| `TRANSLATION_MODEL` | Standalone static-news translation script; not submission/publication |

## Changed files

Paths are repository-relative. Existing authentication/permissions, visual design and published data were preserved.

| Files | Change |
|---|---|
| `staff-app/src/app.js` | Idempotency contracts, image/approval validation, pagination/detail, fresh JSON, image CSP, injectable test upload grant |
| `staff-app/src/database.js` | Transactional replay, attachment replay, finance-independent News writes, safe ordering/paging/slug lookup |
| `staff-app/src/storage.js` | Re-sign existing validated Blob pathname |
| `staff-app/src/news-publishing.js` | Legacy/source-language normalization and complete gallery |
| `staff-app/src/validation.js` | Consistent text normalization and limits |
| `staff-app/public/api.js` | Strict responses, replay keys, upload completion and AI timeout |
| `staff-app/public/app.js` | Retry recovery, input validation/limits and preserved edits |
| `staff-app/public/previews.js` | Metadata/image precedence/gallery alignment |
| `news-data.js` | Pagination, resilient loading, direct lookup, timeout compatibility |
| `news.js`, `news-home.js` | Public rendering, metadata, gallery, search and errors |
| `news.css`, `uudised.html`, `translations.js` | Localized notices using existing design |
| `vercel.json` | Extensionless News routes |
| `staff-app/test/news-api.test.js`, `ui.test.js`, `validation.test.js`, new `news-preview.test.js` | Editor/API/retry/timeout/validation regressions |
| `staff-app/test/schema.integration.test.js`, `storage.test.js`, new `news-publishing.test.js`, new `news-workflow.test.js` | SQL/schema/storage/publishing/API regressions |
| `staff-app/test/public-news.test.js`, `public.browser.mjs`, `vercel-routing.test.js` | Public paging/rendering/routing; isolated browser build snapshot |
| New `staff-app/test/news-workflow.browser.mjs`, `test/helpers/news-workflow-fixture.mjs`, `test/helpers/news-workflow-server.mjs` | Real browser/HTTP/SQL workflow with isolated provider fixtures |
| This report | Current audit findings and verification |

## Verification

Application checks used Node 22.23.2. Browser checks used installed Chrome and bundled Playwright.

| Check | Result |
|---|---|
| `npm test` | **271 passed, 0 failed, 0 skipped** |
| Final `node --test staff-app/test/news-workflow.test.js` after cache/CSP changes | **5 passed, 0 failed** |
| `npm run lint` | **Passed**; repository lint runs syntax/site checks |
| `npm run typecheck` | **Passed** |
| `npm run build` | **Passed**, public/admin output generated |
| `git diff --check` | **Passed** |
| `news.browser.mjs` | **Passed**: 12 News, 24 finance regression, 6 public scenarios |
| `news-local-image.browser.mjs` | **Passed**: image codecs/conversion and 6 image workflows |
| `public.browser.mjs` with `NEWS_ONLY=1` | **Passed**: static/dynamic articles in three languages, paging/search, metadata, cover + two additional images, errors/retries |
| `news-workflow.browser.mjs` | **Passed**: real form/API/SQL/image-validation/public-page flow and uncertain-response recovery |

The new browser test completes the exact minimum-field sequence, checks a member's nonpublic `SUBMITTED` record, reviewer approval, a fresh application instance, public listing and article content. It repeats with all form metadata, a cover, two additional images and accepted optional AI correction. It then tests AI provider failure, a gateway response lost after a committed create, edited retries, database finalization failure and a lost submit response, proving one published article and no false success.

It also scrolls through actual rendered sections, checks visibility and loaded image pixels. Minimum/full/retry screenshots are stored under ignored `staff-app/private/generated/news-audit/`; the full article was visually inspected. Existing tests additionally cover missing/disabled AI, provider errors/malformed responses/timeouts, required-field errors, auth/CSRF, image type/size/integrity/cleanup and schema drift.

## Remaining limits

- **Not deployed or verified against live production services.** Google OAuth, hosted PostgreSQL/PgBouncer, real Blob credentials/objects, live AI availability and Vercel cold starts/CDN behavior were not exercised. Tests use real PostgreSQL-compatible PGlite plus isolated provider/locking substitutes. A fresh application instance is not a Vercel deployment test.
- The historical failed article was not identified. Its production ID/status/logs are needed; inspect the creator's drafts, review queue and published record before resubmitting/recovering it.
- The optional full-site responsive browser sweep was interrupted; no completed result is claimed. All targeted News browser suites above completed.
- External image URLs depend on their host. A historical local-only file that was never uploaded/deployed cannot be recovered from this repository. New prepared/uploaded images use persistent Blob.
- After deployment, actual staff/reviewer accounts should repeat the minimum and image workflows and confirm the same IDs, statuses and public image URLs. Local implementation and verification are complete; production success is not claimed.
