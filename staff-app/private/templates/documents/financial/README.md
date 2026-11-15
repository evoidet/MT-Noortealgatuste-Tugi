# Financial templates

`invoice.docx` is the editable invoice template, adapted from the retained Word
design. Both invoice formats use the labels and formatted data in
`staff-app/src/invoice-layout.js`, including project and payment references,
party details, totals and payment conditions. The invoice PDF renderer follows
the Word tables, palette and A4 layout using PDFKit and bundled DejaVu Sans.
Production runs on Vercel and generates both formats in memory.

The invoice template and `logo.png` contain the same official logo bytes.
`quotation.docx` keeps its existing layout, and `quotation-reference.docx`
is the retained quotation source. The fonts are covered by `FONT-LICENSE.txt`.

Newly finalized invoices store both exact files in PostgreSQL. Downloads and
outgoing mail reuse stored files where available. Historical financial invoices
can be exported in a missing format from their saved data. The original stored
files are retained. Legacy submission exports also use the invoice layout.

Generate synthetic samples locally without a database or email transport.

```sh
node staff-app/scripts/preview-financial-docx.mjs
```

The script writes basic and multipage invoice pairs and Word quotations under
the ignored `staff-app/private/generated/financial-docx` directory.
