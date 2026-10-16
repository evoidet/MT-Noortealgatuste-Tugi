# Financial PDF templates

`quotation-reference.docx` is the owner's supplied reference, retained unmodified.
`logo.png` is extracted from its `word/media/image1.png`.

The executable templates are in `staff-app/src/financial-pdf.js`: quotation and
invoice use different headings, metadata and payment sections. Shared drawing
helpers reproduce the reference's A4 format, green table header (`#0e3b03`), pale
green totals (`#e9f1cb`), supplier/customer columns and banking footer. Embedded
DejaVu Sans replaces Aptos to support Estonian without relying on installed fonts.
See `FONT-LICENSE.txt`. No sample rows or filling instructions enter customer PDFs.

Organization details come from `staff-app/src/organization.js`. Finalization stores
the issuer snapshot and exact PDF bytes in PostgreSQL. Later configuration or
template changes do not change previously finalized documents.

Offline visual verification:

```sh
node staff-app/scripts/preview-financial.mjs
```

This generates only synthetic specimens in ignored `staff-app/private/generated`.
It does not connect to the database or send mail. Render all pages with Poppler.
