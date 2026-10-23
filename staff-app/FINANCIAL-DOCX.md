# Financial Word workflow and validation

New financial invoices and quotations use private `invoice.docx` and
`quotation.docx` templates. These are patched copies of the supplied Word exports,
not reconstructed layouts. Only `word/document.xml` and `word/footer1.xml` differ
from the sources; styles, theme, logo and relationships remain byte-for-byte intact.

Source SHA-256:

- Invoice: `12c8454e5769c1aef767e433f05a9b263402223444b204cf7e2b471d87b41ac9`
- Quotation: `662b5a31b342956fc9481997f913829948eae0ae3f47207a8589e6844a59b949`

Regenerate templates with `scripts/prepare-financial-docx.py INVOICE_SOURCE
QUOTATION_SOURCE` (Python with lxml). Runtime generation in
`src/financial-docx.js` uses the existing docxtemplater and PizZip dependencies.
Vercel's existing private-template include glob includes both files.

The six tables, Aptos fonts, colors, margins, logo and footer geometry are retained.
Editable item rows repeat, with at least three rows preserving the minimum layout.
Sample filling-help prose is removed. Values retain their source run formatting.
Quotation conditions retain the original heading and ordering. Amounts and terms
come from the saved record; EUR 1,500 is only a synthetic preview example, never a
global default. Empty optional fields use an em dash. Service dates remain separate
from issue dates. VAT footer statements follow the stored issuer snapshot.

## Confirmation, permissions and compatibility

Migration `012_financial_docx.sql` must run through the existing deployment workflow
before the new code is used. It adds DOCX and confirmation metadata, broadens the
artifact constraint and adds a unique confirmation-delivery index. No issued
financial data or PDF bytes are rewritten. It has only been applied in test databases.

Finalization stores DOCX bytes, confirmer identity/time and the email claim in one
transaction. Existing SMTP sends that DOCX to `egor.stepanov@noortetugi.ee` with an
Estonian subject and document/customer/total/confirmer details. Confirmation stays
valid if email delivery fails. `confirmation_delivery_status` tracks SENDING, SENT
or UNCERTAIN independently from the document status, with financial history and
delivery records. SENT means SMTP acceptance, not verified inbox receipt.

Repeated clicks cannot re-confirm or re-send. An ambiguous SMTP response or process
crash requires administrative review; no automatic retry is offered. Do not reset
a delivery claim without checking provider/mailbox evidence first. Explicit customer
emails remain available with DOCX attachments; manually resending to Egor after
automatic confirmation is blocked. Legacy manual email behavior is preserved.

Authorization reuses persisted `financial_access` grants tied to verified Google
account IDs, including Egor and Mihhail Komarov. Display names are not authorization
keys and the admin role alone does not grant financial access. Roles and accounts
are unchanged.

Confirmed Word downloads use stored bytes. Older PDFs stay downloadable. An older
record can be exported to Word from its saved snapshot without replacing its PDF.
The UI uses “Laadi alla Wordi fail” and shows confirmation delivery separately.

## Visual verification on 2026-10-22

`node staff-app/scripts/preview-financial-docx.mjs` generates four synthetic files
under ignored `private/generated/financial-docx`, with no database or email access.
Both originals and every generated page were rendered using Microsoft Word and
inspected as PNGs. Normal examples are one page; long names and 12 descriptive rows
produce two pages with repeated table headings and no visible clipping.

The bundled LibreOffice renderer was attempted but LibreOffice was unavailable;
installed Microsoft Word supplied the renders instead. Comparison used the attached
DOCX exports because the Google Docs links were inaccessible. Package preservation
and section geometry were checked separately.

Intentional differences: filled fields, removal of sample help, dynamic row counts,
changed conditions text/height and VAT-dependent footer wording. Repeating the first
item-row style slightly changes the combined height of the three sample rows. No
pixel-perfect claim is made for arbitrary future content.

## Changed files

Validation results: all 343 automated tests passed under Node 22.23.2; the browser
test passed using bundled Playwright on Windows; `npm run typecheck` passed;
`npm run build` passed with production migration hooks disabled for this local
build. `git diff --check` passed. Tests cover both authorized accounts, both document
types, unauthorized requests, concurrent confirmation, mocked SMTP failure,
attachment content, preserved legacy bytes, editable tables and distinct dates.
Real inbox delivery was deliberately not tested.

Follow-up review: fixed blank optional service dates preventing draft saves and
removed the automatic Egor default from the customer-send form after confirmation.
Six focused document/workflow tests, the browser test, typecheck and build passed
again. Additional regression coverage verifies stored DOCX customer delivery and
SMTP acceptance followed by a delivery-status database failure without permitting
a duplicate confirmation email. Template binaries were unchanged in this review.

- `src/financial-docx.js`: template-based generation and filenames.
- `src/financial-routes.js`: Word downloads, confirmation email and delivery feedback.
- `src/financial-repository.js`: atomic confirmation and delivery audit records.
- `src/mail.js`: DOCX attachments through existing SMTP.
- `public/financial.js`: Word actions, separate dates and delivery status.
- `src/financial-validation.js`: normalize blank optional service dates without inventing dates.
- `migrations/012_financial_docx.sql`: additive storage and uniqueness changes.
- `private/templates/documents/financial/{invoice,quotation}.docx`: prepared templates.
- `private/templates/documents/financial/README.md` and this file: documentation.
- `scripts/prepare-financial-docx.py`, `scripts/preview-financial-docx.mjs`: preparation and offline previews.
- `test/financial-docx.test.js`, `test/financial.test.js`, `test/financial.browser.mjs`,
  `test/schema.integration.test.js`: document, workflow, browser and migration checks.

No deployment, production migration, production financial record or real test email
was performed. Environment/secret files were not accessed.
