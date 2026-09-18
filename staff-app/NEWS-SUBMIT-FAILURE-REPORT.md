# News final Submit failure — verification report

## Result and scope

Reproduced the reported symptom through the actual staff browser form with an uploaded PNG and empty summary. The regression failed before the change and passes after it: final Submit returns 200, the browser displays success, and exactly one article and ready image remain available after refresh.

The application routes, session/CSRF checks, SQL repositories, migrations, image validation and public rendering are exercised. Tests use isolated PostgreSQL-compatible PGlite and synthetic Google identity, Blob and AI providers. This is local end-to-end verification, **not confirmation of a live Vercel deployment or attribution of the historical production incident**. No secret files were opened and no production records were changed.

## Root cause and failure stage

The final Submit route committed the article's final status and then called `summarizeSubmission()`. That function performed fresh attachment/review database reads to construct the response. A connection/read failure at that point returned 500 even though publication had succeeded. The frontend's recovery GET depended on the same reads, so it also failed and left the browser displaying a generic failure.

Exact browser evidence with an injected post-commit `ECONNRESET`:

| Observation | Before | After |
|---|---|---|
| Request | `POST /api/staff/submissions/<id>/submit`, `application/json`, `{}` | Same |
| Response | 500, `{"error":"REQUEST_FAILED"}` | 200, item with matching ID and `PUBLISHED` status |
| Independent SQL reader | One published article | One published article |
| Image records / stored objects | One ready attachment / one object | One ready attachment / one object |
| Submit requests after double click | One | One |
| Browser | Generic error; no success view | Success view; no error or uncaught exception |

Failure stage: **form → API → database commit → response construction → failed recovery GET → error UI**. The image upload had already completed successfully during Preview.

A separate image retry defect was also confirmed: losing the PUT response caused the client to delete an image that Blob could already have accepted, then upload it again. The new browser regression returns a synthetic 502 after accepting the bytes and confirms successful verification/publication with one PUT and no deletion.

## Fix and request lifecycle

News create responses use their known empty relations. News save/final Submit load attachment/review data before committing, under the existing submission lock, and build the response from that data and the finalized record. A failure preparing the response now leaves an unsubmitted draft and reports its stage.

The existing lifecycle remains:

1. Required title/body are validated; optional inputs stay optional. AI runs only when explicitly requested.
2. Preview creates/updates an authenticated, CSRF-protected draft using JSON and a stable create key.
3. Images use upload-intent JSON → signed private Blob PUT → completion verification → persisted ready attachment with its final Blob URL/path. Ordinary uploads validate bytes/type/size/checksum; the optional local-image tool retains its conversion/resizing behavior.
4. Final Submit saves edits, prepares response data, validates persisted news/images/schema, and commits the existing member `SUBMITTED` or reviewer `PUBLISHED` transition.
5. The browser checks the returned ID/status before success. Existing reconciliation handles uncertain submit responses; publication remains idempotent.

Ambiguous image PUT failures now verify the original object before retrying. A definitively missing object retains the original request key/path; temporarily unavailable verification retries completion. Invalid uploads retain the existing server cleanup behavior.

API parsing rejects HTML, malformed/empty JSON, arrays and explicit false success flags. Typed errors preserve HTTP status, code and stage. News failures use the compatible string-error contract plus `ok:false`, a safe message and stage. Known authentication, validation, upload and response failures have localized messages. Logs retain safe technical codes/stages without raw provider diagnostics, SQL, credentials or submitted text.

## Files changed

| File | Purpose |
|---|---|
| `staff-app/src/app.js` | Prepare news response data before committing; stage-specific safe errors/logs. |
| `staff-app/public/api.js` | Recover uncertain PUT results; preserve error metadata; reject invalid success responses. |
| `staff-app/public/app.js` | Preserve specific API error causes through Preview/final Submit; show session-expiry notice. |
| `staff-app/public/staff-translations.js` | Estonian/English/Russian save, submit, image, response and slug-conflict messages. |
| `staff-app/test/news-api.test.js` | Lost PUT, conflict, missing-object and API-contract regressions. |
| `staff-app/test/news-errors.test.js` | UI mappings for HTTP/status/code failures and safe stage diagnostics. |
| `staff-app/test/news-workflow.test.js` | Commit/response ordering, database/upload failures, recoverable missing Blob tests. |
| `staff-app/test/schema.integration.test.js` | Assert the specific news database error contract. |
| `staff-app/test/helpers/news-workflow-fixture.mjs` | Controlled post-commit read failures and upload counters. |
| `staff-app/test/helpers/news-workflow-server.mjs` | Controlled lost upload responses and fixture diagnostics. |
| `staff-app/test/news-submit-failure.browser.mjs` | Browser reproduction and regression for final Submit with image, plus lost PUT recovery. |
| `staff-app/test/news-submit-matrix.browser.mjs` | Real form/image/optional-field matrix and explicit transport-failure matrix. |
| `staff-app/NEWS-SUBMIT-FAILURE-REPORT.md` | Evidence, verification limits and deployment instructions. |

No schema migration, environment requirement, UI layout or business permission changed.

## Tests actually executed

Application checks ran with Node 22.23.2; browser checks used Chrome/Playwright.

| Check | Result |
|---|---|
| Baseline `npm test` | 271 passed before changes; demonstrated prior coverage missed the defect. |
| Baseline final-Submit browser regression | Failed as expected: 500 after publication, no success view. |
| Final `npm test` | **282 passed, 0 failed, 0 skipped.** Includes backend, schema/migration, validation, auth, storage, API and UI tests. |
| Final targeted error-message tests | **2 passed** after adding mappings for missing IDs/invalid upload grants. |
| `npm run lint`, `npm run typecheck`, `npm run build`, `git diff --check` | **Passed.** Repository lint is syntax/site validation. |
| `news-submit-failure.browser.mjs` | **Passed:** post-commit read outage, final Submit with image, one record/object, refresh, lost PUT recovery. |
| `news-submit-matrix.browser.mjs` | **11 real form submissions passed:** text with/without summary; JPG/JPEG/PNG/WebP with/without summary; 3264×2448 JPEG, 6,993,361 bytes. Blank slug/date generate unique slug/valid date. Double clicks create one record; staff/public reads and images survive refresh/application recreation. |
| Matrix transport scenarios | **16 passed:** 400/401/403/404/409/413/415/422/429/500/502/503, HTML, empty/malformed JSON and network failure. These failures are explicitly injected, not claimed production responses. |
| `news-workflow.browser.mjs` | **Passed:** member/reviewer workflow, no summary/image, full metadata/gallery, accepted AI correction, AI failure, lost create/submit responses and database failure recovery. |
| `news.browser.mjs` | **Passed:** 12 News, 24 finance and 6 public rendering scenarios. |
| `news-local-image.browser.mjs` | **Passed:** codecs/conversion/crop/orientation/corrupt input and 6 local-image upload workflows. |
| `npm run db:check` against live configuration | **Could not run:** this process did not have `STORAGE_DATABASE_URL_UNPOOLED`. No secret-file fallback was used. |

The browser scripts run with `node staff-app/test/<script>.mjs` when Playwright and Chrome are available; this workspace used its bundled Playwright through `NODE_PATH` and `BROWSER_CHANNEL=chrome`.

## Database and production checks

Summary is stored inside `submissions.data_json`; there is no separate summary column or summary NOT NULL requirement in the repository migrations. Existing migration/schema tests cover fresh and drifted schemas, final statuses/timestamps, unique slugs, attachment uniqueness and ownership. These checks do not prove the deployed database is current. No new migration is needed for this change.

The Vercel route remains the existing single Node function; all API rewrites, the Node 22 setting, private storage and 60-second function duration are unchanged. Direct browser uploads avoid the function request-body limit; the tested large image used that path. See Vercel's [function limits](https://vercel.com/docs/functions/limitations) and [private Blob signed URLs](https://vercel.com/changelog/vercel-private-blob-is-now-generally-available).

Deploy the changed backend and staff assets together. In the configured production environment run `npm run db:check`; the existing production build already runs migration then schema/checksum checks. Confirm that build succeeds. Runtime source still requires `STORAGE_DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, Google OAuth settings and `SESSION_SECRET`; the migration check uses `STORAGE_DATABASE_URL_UNPOOLED`. `APP_URL` and `GOOGLE_CALLBACK_URL` must match the deployed origin, with callback path `/api/staff/auth/google/callback`. Existing shared mail/configuration requirements remain unchanged. `OPENAI_API_KEY` stays optional. Live credential presence/validity, hosted PostgreSQL/PgBouncer, Google OAuth, Blob service behavior and provider AI availability were not verified here.

## Manual verification on the deployed site

1. Deploy these changes and confirm production migration/check logs succeed. Open `/admin/` and sign in as a normal staff member.
2. Open Add News / Lisa uudis. Enter a unique test title and body, attach a JPG/PNG, leave summary empty and leave AI unused. Open Preview; confirm the image loads.
3. Open browser DevTools Network. Click final Submit once. Confirm one `POST /api/staff/submissions/<id>/submit`, HTTP 200, matching `item.id`, status `SUBMITTED`, and the success screen. The earlier upload sequence should show intent → one Blob PUT → successful completion.
4. Refresh My submissions and open the record: title, body and image must remain. Confirm the ID identifies exactly one submission and one ready primary attachment in the database.
5. Have another authorized reviewer approve it. A reviewer/admin submitting their own news instead reaches `PUBLISHED` directly. Open the public News list and article in a fresh browser, then refresh; confirm title/body/image remain visible.
6. Repeat with a summary, without an image, with JPEG/WebP and a normal larger phone photo. If configured, explicitly apply an AI correction and submit once more.
7. If any attempt fails, capture its submission ID, timestamp, HTTP status and safe JSON code/stage. Match those to the server log before creating a replacement article. Historical production cause remains unconfirmed until that evidence is checked.
