# Repository-backed news publishing

## Architecture

The staff form is the only authoring UI. Saving keeps a PostgreSQL draft and
attachment metadata. Submit validates the saved draft and ready private Blob
attachments, generates one complete public article, and updates
`published-news.json` through the GitHub Contents API on `main`. No local Git
checkout, branch, pull request, or operator command is part of publication.

GitHub returns a commit SHA before the submission becomes `PUBLISHED`. Vercel's
Git integration then deploys the commit. The public browser loads
`/published-news.json`; PostgreSQL is retained for drafts, audit history,
recovery, and attachment authorization, but it is not a public article-content
source. Existing hand-authored catalogue entries remain repository content and
are merged with the generated catalogue by `news-data.js`.

Uploaded image bytes remain in private Vercel Blob. The generated article stores
the stable public application URL
`/api/staff/public/news/<submission>/attachments/<attachment>`, made absolute
with `PUBLIC_SITE_ORIGIN`. That endpoint serves only ready attachments belonging
to a `PUBLISHED` news submission.

## Required configuration

- `GITHUB_TOKEN`: fine-grained token with Contents read/write permission for
  the configured repository. Store it only as a sensitive server-side Vercel
  variable.
- `GITHUB_REPOSITORY`: `owner/repository`.
- `GITHUB_BRANCH`: must be `main`.
- `PUBLIC_SITE_ORIGIN`: canonical HTTPS public origin used in image URLs.
- `GITHUB_API_URL`: optional; defaults to `https://api.github.com`.

GitHub must allow this token to update `published-news.json` directly on main.
If a ruleset requires pull requests or blocks the token, Submit returns a safe
publishing error and leaves the database draft retryable.

## Consistency and retries

Before replacing the previous deployment, production builds check that every
PostgreSQL `PUBLISHED` news UUID exists in the checked-out catalogue. A missing
UUID stops the build, preserving the previous deployment. From a trusted shell
with the existing configuration, run `npm run news:reconcile` for a read-only
report. `npm run news:reconcile -- --apply` explicitly imports missing articles
through GitHub Contents API; deploy the resulting main commit. Neither command
changes database statuses. No GitHub write occurs during the build check.

Every publication also imports missing published UUIDs in the same SHA-checked
commit. Retrying an already-PUBLISHED submission verifies repository presence
instead of trusting its database status. Existing repository versions win over
database snapshots, so reconciliation cannot revert a newer title or slug.

Legacy static slugs and slugs owned by another submission are reserved. A
collision returns `NEWS_SLUG_CONFLICT` without a write; choose a distinct slug
and retry. Imports fail closed on an existing legacy collision and require
deliberate slug correction before deployment. The public merge also refuses
to replace a different article identity. Slug changes for the same UUID are
accepted only if the destination is free.

The publisher reads the file and its SHA, upserts by submission UUID, and sends
the SHA with the direct commit. A 409 or 422 causes a fresh read and bounded
retry so concurrent submissions are merged. Retrying the same submission is
idempotent and makes no commit when the generated article is unchanged.

The external commit happens before the database status update. If the database
update fails afterward, retrying Submit observes unchanged repository content
and completes the database transition without a duplicate article. PostgreSQL
and audit records provide the recovery trail.

## Deployment verification

1. Confirm the GitHub variables exist in Vercel Production and the token has
   repository Contents read/write access.
2. Confirm main permits this token's direct update to `published-news.json` and
   that the Vercel project deploys commits from main.
3. Submit an article with an uploaded image and optional Google Forms link.
4. Confirm the staff UI reports success only after GitHub returns a commit.
5. Confirm the commit changed `published-news.json`, a Vercel deployment starts,
   and the article appears on the homepage, news list, and direct article URL.
6. Repeat without a registration URL. Then try a malformed URL and confirm the
   field-specific message appears without a commit.

Tests use an injected in-memory publisher or mocked HTTP responses. They never
write to the real repository.
