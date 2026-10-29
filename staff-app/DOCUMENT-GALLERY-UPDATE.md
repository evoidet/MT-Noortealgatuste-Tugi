# Document and team gallery update

## Behavior

- Invoice and quotation forms save a separate optional Viide (`reference`).
- The invoice information table also contains Viitenumber. Quotations show no payment reference field.
- Invoice payment descriptions always include the invoice number. The instruction about the banking reference field is included only when a reference number is present.
- Both Word templates retain their original branding, styles, images and tables. The new information row copies the existing cell formatting.
- Approval, numbering, immutable finalized documents and duplicate-send protection remain in place. Confirmation sends the DOCX through the existing mail service. Downloading does not depend on SMTP success.
- Confirmation recipient, CC, reply-to and UI delivery address use the existing configured finance notification address. No new email configuration or database migration is required.
- Team photos have no decorative frames or visible profile descriptions. Their existing optimized files and alt text are preserved. The shared modal has a minimal photo view, keyboard focus containment, focus restoration, backdrop/button/Escape dismissal and stable scrollbar space.

## Changed implementation files

- `src/financial-validation.js`: retain and validate the new reference text.
- `public/financial.js`: editable reference input, form serialization and configured delivery address.
- `src/financial-docx.js`: new template values, adaptive payment instructions and invoice number in the payment description.
- `src/financial-routes.js`, `src/mail.js`: use the existing configured finance recipient consistently.
- `private/templates/documents/financial/invoice.docx`, `quotation.docx`: new information row and invoice payment instructions.
- `scripts/prepare-financial-docx.py`: reproducible template updates.
- `scripts/preview-financial-docx.mjs`: offline examples with the new fields.
- `../index.html`, `../home.css`: minimal gallery and accessible photo modal.
- `test/financial-docx.test.js`, `test/financial.test.js`, `test/mail.test.js`, `test/financial.browser.mjs`, `test/team-gallery.browser.mjs`: field propagation, document contents, configured mail recipient, download after mail failure and browser interactions.

## Verification and delivery

The DOCX examples are generated offline using synthetic customer data. No database records or real emails are created. Both ordinary examples fit on one page; long examples use two pages with repeated item-table headings. All six generated pages were rendered through Microsoft Word and visually inspected. The packaged LibreOffice renderer was unavailable on this Windows runtime.

Browser checks cover invoice/quotation forms and the team modal at desktop, tablet and mobile widths. SMTP tests use an injected transport; actual mailbox delivery is not verified by those tests.

Changes are local to the repository and require the normal deployment process to reach the live website. Already finalized documents keep their stored original bytes; use the existing correction workflow for replacements.

For manual editing use the filled `Arve.docx` and `Hinnapakkumine.docx` examples. For application integration keep the placeholder-bearing `invoice.docx` and `quotation.docx` templates in their existing private template directory.
