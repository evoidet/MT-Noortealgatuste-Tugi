# News URL validation verification

The change was exercised through the actual Chromium News form, including Preview and final Submit, against the real Express app and SQL repository. The local fixture applies the database migrations and verifies uploaded image bytes. External Google identity and Vercel Blob services use isolated test adapters. This is local browser verification, not a production Vercel deployment.

## 1. Field responsible for the reproduced error

**Image URL (`image`, input `newsImage`).** Loading the original frontend from Git HEAD and entering `/assets/news/url-regression.png`, together with a valid `https://forms.gle/ValidRegistration` registration link, reproduced:

- Native Image URL validity: `typeMismatch: true`.
- Native message: `Please enter a URL.`
- Form toast: `Complete all required fields.`
- No draft created and no field-specific error.

The original failed production request was not supplied, so its particular field/value cannot be established. The image failure above was reproduced directly; a valid Google Forms registration URL was not its cause.

## 2. Root cause and flow audit

The News form has two URL values: `registrationUrl` and `image`. `project` is plain text, and `slug` is a separate URL identifier, not a URL input.

1. Both URL inputs used native `type="url"`. The Image URL backend accepts root-relative site image paths, which native URL input validation rejects. `validateCurrentForm()` reduced any native validity failure to a required-fields toast.
2. The backend image limit was 500 characters, unnecessarily rejecting longer valid HTTPS image URLs. Registration already allowed 2048 characters.
3. Schema validation discarded the field-specific refinement message, retaining only path/code. API handling rebuilt generic field messages.
4. Save/Preview error handling displayed generic toasts. Structured rendering handled only the preview screen, and its field map omitted registration and image controls.
5. Form data travels as JSON through create/update/final-submit APIs. Image bytes use the existing upload-intent, PUT and completion flow, not a manually supplied URL or news FormData field.
6. The storage layer validates the final private Blob URL after upload, then stores it in the article's attachment record (`blob_url`). Public image URLs are derived from ready attachments. This architecture is retained; preview `blob:` URLs never become persisted article URLs.

The audit included form collection, native validity checks, Zod refinements, request serialization, Vercel's API entry point, Express routes, upload completion, database writes and public news projection. No literal `Invalid URL`, `Unknown error`, `invalid_url`, or `z.string().url()` was found in that flow; URL parsing uses caught `new URL(...)` calls.

## 3. What changed

- Registration remains optional. Undefined, null, empty and whitespace-only values normalize to the existing correct empty value `""`; URL parsing runs only for nonempty input.
- Both Google Forms formats and normal HTTPS registration links are accepted after trimming. Existing HTTP registration support is preserved.
- Invalid URLs display `Registration URL is invalid.` or `Image URL is invalid.` beside the relevant input, with accessible field associations. Errors clear when corrected. Estonian and Russian translations are included.
- Supported relative image URLs pass frontend validation; both URL limits are 2048 characters.
- A selected image uploads automatically and supersedes a stale manual Image URL. Upload failures identify the image picker with `Image upload failed.`; retry retains the draft and attachment identity.
- Actual staff authentication failures retain their handling. A denied storage PUT is reported as an image upload failure.
- Backend errors retain all invalid URL fields and safe fixed messages without exposing submitted values or stack traces. Example response, HTTP 422:

```json
{
  "error": "VALIDATION_ERROR",
  "ok": false,
  "stage": "validation",
  "field": "registrationUrl",
  "message": "Registration URL is invalid.",
  "fields": [
    { "field": "registrationUrl", "message": "Registration URL is invalid." }
  ]
}
```

## 4. Files changed

Production code:

- `public/app.js`: URL validation, normalization, inline errors, upload error attribution.
- `public/staff-translations.js`: field-specific URL and upload messages.
- `public/styles.css`: keeps the News upload error on a full row beneath the image picker.
- `src/validation.js`: optional URL normalization and safe schema messages.
- `src/app.js`: structured URL and image-upload error responses.

Tests:

- `test/news-url-form.test.js`: frontend validation, errors, request data and upload regressions.
- `test/news-url-validation.browser.mjs`: actual browser submissions and failure/retry checks.
- `test/validation.test.js`: optional values, Forms URLs and field-specific schema failures.
- `test/news-workflow.test.js`: create/update/final-submit API validation and SQL/image persistence.
- `test/storage.test.js`: generated image URL acceptance/rejection after upload.
- `test/helpers/news-workflow-fixture.mjs` and `test/helpers/news-workflow-server.mjs`: deterministic failed-upload support in the isolated test fixture.
- `NEWS-URL-VALIDATION.md`: this report.

## 5. Tests performed

Final checks passed: **297 automated unit/integration tests**, TypeScript checking, the build (with production migrations disabled for local verification), and `git diff --check`.

The browser script successfully submits seven articles with uploaded PNGs: empty registration, whitespace registration, forms.gle, docs.google.com/forms, trimmed ordinary HTTPS, trimmed forms.gle, and an upload replacing a stale manual Image URL. Each checks SQL persistence, a ready attachment, the generated public URL, exact retrieved image bytes and a loaded image on the public article page.

It also checks malformed registration/image errors beside the correct fields, correction clearing, invalid draft prevention, relative and longer HTTPS Image URL acceptance, real backend HTTP 422 rejections, and a failed image upload followed by successful retry of the same draft and attachment. No browser page errors occur.

Run from the repository with Node 22:

```sh
node --test --test-concurrency=2 staff-app/test/*.test.js
npm run typecheck
npm run build
node staff-app/test/news-url-validation.browser.mjs
```

The browser script additionally requires Playwright and Chromium. On this workstation it uses Windows Node with the bundled Playwright package, and the existing WSL Node 22 runtime for the fixture server. Browser screenshots are saved under `staff-app/private/generated/news-url-validation/` (ignored local artifacts).

## 6. Vercel verification

1. Deploy this revision to Vercel, open `/admin/?lang=en`, sign in and start News. Use unique test titles and fill the required title/body.
2. Paste a real forms.gle link with surrounding spaces, upload a PNG/JPEG/WebP without filling Image URL, then Preview and Submit. Confirm success, the image, and the trimmed registration link. Repeat with a docs.google.com/forms link.
3. Submit another article with an uploaded image and Registration link completely empty. Confirm success and no registration button. Repeat with spaces only if desired.
4. Enter `not-a-url` in Registration link. Preview and Save draft must identify `Registration URL is invalid.` beside that field. Correct it and confirm the error clears.
5. With no uploaded image selected, enter `not-a-url` in Image URL. Confirm `Image URL is invalid.` beside Image URL. Selecting an image instead must allow the existing automatic upload flow.
6. On a test submission, use browser developer-tools request blocking to block the image storage PUT. Confirm `Image upload failed.` beside the image picker, with no registration error or successful submission. Remove the block and retry; verify the original draft submits once with its image.
7. Refresh the saved submission and, after the normal publication step for your role, the public article. Confirm the image and optional registration behavior persist. Database schema, authentication setup and publishing permissions are unchanged.
