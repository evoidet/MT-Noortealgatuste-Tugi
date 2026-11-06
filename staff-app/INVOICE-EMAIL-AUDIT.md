# Invoice email audit — 6 November 2026

## Findings before changes

- The current financial-document system confirmed invoices by storing and emailing DOCX files through the existing server-side Nodemailer SMTP service. The recipient came from `FINANCE_NOTIFICATION_EMAIL`, rather than the signed-in user. Egor and Mihhail already shared this confirmation path when granted financial access.
- New confirmations did not generate or store a PDF. PDF download returned a conflict for these Word-only records. Neither PDF nor Word downloads triggered email.
- Confirmation claims were durable and protected concurrent confirmation attempts, but SMTP failures were silently caught.
- The older submissions-based invoice archive generated Word documents and archived confirmations to Drive. It did not email invoice copies. Its existing authorization is narrower than the current financial-document system; this change preserves those permissions.

## Resulting behavior

- Every new invoice confirmation generates and stores a PDF alongside the existing Word artifact. Its automatic email attaches that PDF and includes the invoice number, customer, total, confirmation time and confirming user.
- Automatic invoice copies always target `egor.stepanov@noortetugi.ee`. Neither the actor's identity nor a different finance notification setting changes this destination. Existing SMTP settings and infrastructure are reused; no dependencies or credentials were added.
- The invoice editor and confirmed invoice screen offer PDF downloads. Explicit PDF downloads (`GET /api/staff/financial/:id/pdf?download=1`) email the exact response bytes. Inline PDF previews and HEAD requests do not send email.
- Existing Word downloads remain available and trigger a PDF copy of the same invoice. Existing finalized Word-only financial records can also generate a PDF from their immutable snapshots. Existing stored PDF bytes are preserved.
- Legacy invoice confirmation and document downloads also generate an equivalent PDF copy using the existing invoice normalizer, line rounding, numbering and PDF renderer. Their existing Word download format and Drive archive behavior are preserved.
- Downloads send their HTTP response before email work and register that work with the already installed Vercel `waitUntil` infrastructure. SMTP delay, rejection or failure cannot block the download.
- PostgreSQL row locks serialize notification claims across users, tabs and server instances. Claims are committed before SMTP is called. Confirmation and downloads of unchanged content within **60 seconds** share one notification; rapid repeat downloads likewise share one notification. A later deliberate download after that interval can send another copy. Changed content has a different snapshot key.
- `SENT` is recorded only when SMTP explicitly lists the destination as accepted. Provider acceptance does not prove inbox delivery. Errors and nonacceptance remain `UNCERTAIN`; unfinished claims remain `SENDING`. Neither state is automatically retried for the same snapshot, because an SMTP timeout can occur after acceptance. Administrators must reconcile these states against provider/mailbox records before permitting another attempt.
- Diagnostic logs use the existing safe-error sanitizer and exclude raw SMTP messages, credentials, invoice contents and customer details.

## Verification

No real test emails were sent, no secret files were inspected, and no production service or database was changed.

Focused tests use Supertest, a disposable PGlite database with repository migrations, actual document generators, and mocked SMTP transports. They cover:

1. Egor creates and confirms an invoice.
2. Mihhail creates and confirms an invoice.
3. Egor downloads an invoice.
4. Mihhail downloads an invoice.
5. A separately granted authorized user confirms/downloads an invoice; unauthorized requests remain rejected.
6. SMTP throws, returns no accepted recipients, or waits while the download completes.
7. Confirmation immediately followed by download, and draft download followed by confirmation.
8. Concurrent repeated downloads across users; later downloads after the suppression interval.

Assertions check the fixed recipient independently of finance configuration, PDF MIME type and filename, PDF header/EOF structure, byte equality between downloaded and attached finalized PDFs, invoice details, durable delivery status, safe logging, and unchanged Word templates. Legacy integration tests cover Word download notifications, corrected-content confirmation, immediate admin download deduplication and idempotent confirmation retries. Syntax and TypeScript checks cover the application source.

This is code-level verification with simulated provider acceptance. Production SMTP acceptance, attachment arrival and inbox delivery have **not** been tested.

## Changed files

- `src/financial-routes.js`: invoice PDF creation/download and automatic notification integration.
- `src/financial-repository.js`: transactional notification claims and completion states.
- `src/invoice-notifications.js`: shared invoice copy sender, snapshot keys and safe logging.
- `src/mail.js`: fixed automatic invoice destination through existing SMTP transport.
- `src/app.js`: legacy confirmation/download notification hooks and background-work injection.
- `src/documents.js`: PDF adapter for legacy invoice data, retaining existing rounding.
- `public/financial.js`: invoice PDF actions and accurate acceptance status wording.
- `migrations/013_invoice_download_delivery.sql`: snapshot keys, legacy references, source constraint and indexes.
- `test/financial.test.js`: user/action matrix, concurrency, attachment equality and failure tests.
- `test/mail.test.js`: fixed destination and sanitized error logging tests.
- `test/schema.integration.test.js`: migration ordering and legacy notification integration tests.
- `INVOICE-EMAIL-AUDIT.md`: this report.

## Rollout

Apply migration **013** through the existing database migration process before deploying the updated application. Deployment and migration execution were not part of this local change. With production configuration already supplied, a separately authorized real-email smoke test is still needed to verify provider acceptance and mailbox arrival.
