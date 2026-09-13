# MTÜ Noortealgatuste Tugi document-template contract

This file records the reference-derived layout and editable slots used by the
private server templates. The originals remain the design authority and are
never modified by the preparation script.

## References

### Invoice (`arve`)

- Reference: `C:\Users\egork\Downloads\MTU_Noortealgatuste_Tugi_arve_naidis.docx`
- SHA-256: `143d640eeacbf8de7b7a3951b999d1c19fae6721963280e300c6e077606b458f`
- Source patterns: 2 pages, 2 sections; page 1 is a removable sample cover,
  page 2 is the invoice.
- Evidence render:
  `C:\Users\egork\AppData\Local\Temp\codex-noortetugi-docrefs-20260829\arve`
- Output template: `arve/arve.docx`; one A4 section and one invoice page for
  representative content.

### Expense report (`kuluaruanne`)

- Reference:
  `C:\Users\egork\Downloads\kuluaruanne-KA-6559A6AD.docx.pdf`
- SHA-256: `54c58c34f6dda95f794d50976cafc6f193cc5ec74f9bfbd5aab7dcb3119c11fa`.
- Source patterns: two pages containing six sections, including the finance
  confirmation and two digital-signature areas.
- Output template: `kuluaruanne/kuluaruanne.docx`; one A4 section and two
  pages for representative content. Longer submissions flow to additional pages.
- The checked-in reusable DOCX completely replaces the previous expense
  template. Preparation validates and copies this current template only.
- Full current expense measurements, field contract and verification details:
  [kuluaruanne/artifact.md](kuluaruanne/artifact.md).

## Page systems

- Both references use A4 portrait (`11906 × 16838` twips).
- Invoice margins: top `737` twips (1.300 cm), bottom `709` twips
  (1.251 cm), left/right `765` twips (1.349 cm). Header/footer distances are
  `720` twips.
- Expense margins: top `652` twips (1.150 cm), bottom `709` twips
  (1.251 cm), left/right `737` twips (1.300 cm). Header distance is `312`
  twips and footer distance is `369` twips.
- The source section breaks, page breaks, header/footer relationships, theme,
  styles, numbering definitions, drawings, and image relationships are
  preserved unless this contract explicitly removes the containing sample
  section or page.

## Typography and palette

- Invoice: Aptos body; title 28 pt, bold, `#0E3B03`; labels `#254B10`;
  item and total bands `#0E3B03` with white type; light fills `#F7FAF0` and
  `#E9F1CB`. The supplied logo and its original relationship/drawing geometry
  are preserved.
- Expense report: Times New Roman body; title 16 pt bold centered; Heading 1
  12 pt bold; cells and declarations 9 pt, costs 8.5 pt, application sentence
  10 pt. Source blue header rules and pale-blue table headers
  remain, while all blue italic example values are replaced by black,
  non-italic actual values.
- Paragraph spacing, line spacing, alignment, cell margins, borders, row
  minimum heights, keep behavior, footer PAGE/NUMPAGES fields, and source
  styles remain source-derived.

## Table geometry

- Invoice table grids, in twips:
  - logo/title `[6018, 4358]`
  - metadata `[1849, 3287, 2054, 3081]`
  - seller/buyer `[5128, 5128]`
  - items `[653, 4495, 1160, 943, 1523, 1522]`
  - totals `[8435, 1851]`
  - payment `[10256]`
- Expense table grids, in twips:
  - general data `[2760, 7680]`
  - activity narrative `[2700, 7740]`
  - costs `[2895, 1440, 1365, 1695, 1485, 1620]`
  - signature `[3600, 3440, 3400]`
  - finance signature `[2595, 1800, 3405, 2640]`
- Repeated invoice and expense line-item rows clone the corresponding original
  first data row. Header and total rows retain their source geometry.

## Content flow and slot map

### Invoice

1. Logo/title (preserve).
2. Metadata slots: invoice number/date, due date, currency, transaction time,
   project or contract reference.
3. Seller block (preserve fixed MTÜ details) and buyer slots: name, registry
   code, address, contact.
4. Repeating item row: number, description, quantity, unit, unit price,
   calculated line total.
5. Calculated subtotal, VAT text/amount, and grand total.
6. Fixed payment receiver/account details plus generated payment description
   and reference number.
7. Fixed non-VAT/thanks footer (preserve).

### Expense report

1. Page 1 title/subtitle (preserve); general-data slots for document
   number/date, recipient, role, contact/account/IBAN, activity, expense type,
   location/period/route, and funding source.
2. Narrative slots: where/when, activities and role, necessity, result, and
   participants/beneficiaries.
3. Page 2 title/subtitle (preserve); repeating cost row for description, date,
   source-document reference, gross EUR amount, requested amount, and excluded
   amount, followed by server-calculated totals.
4. Fixed applicant declarations with generated requested total and IBAN.
5. Signature slots: recipient, status, and date.
6. Repeating list of actual attachment file names.
7. Finance confirmation reuses the calculated requested total. The second
   signature table uses financeApproverName, financeApproverRole,
   financeSignatureStatus and financeSignatureDate. The named finance officer
   and digital-signing wording follow the supplied source; generating the
   document does not sign it or record approval.
8. The source's final paragraph explains the last required digital signature
   and signature timestamp.

All slots accept plain text only. The generator escapes XML and removes control
characters. Currency totals are recomputed on the server from line-item data;
client-supplied total fields are not mapped into the document.

## Intentional removals

- Invoice: the sample cover page and the complete `TÄITMISE ABI — KUSTUTA
  ENNE SAATMIST` paragraph.
- Expense report: `NÄIDISDOKUMENT`, the entire `TÄITMISE JUHIS` box, every
  blue italic example/guidance value, the footer instruction beginning
  `Dokumendimall`, the complete `Kuluarvestuse reeglid` box, and sample
  attachment instructions.
- No former sample instructions or internal decision page are active. The
  current source's section 6 finance confirmation is included in full.

## Package-preservation and fidelity gates

- Preserve `word/styles.xml`, `word/theme/*`, numbering, settings other than
  enabling `w:updateFields`, headers/footers except the two explicitly removed
  sample/instruction strings, image binaries, drawing relationships, and all
  source table/cell properties.
- Template preparation must verify the source SHA-256 before and after
  authoring. A hash change or a new reference version requires re-distillation.
- Generated DOCX files must unzip successfully, contain every supplied actual
  value and calculated total, and contain none of the removal markers above.
- Render representative invoice and expense fixtures through Microsoft Word,
  inspect every resulting page PNG at 100%, and reject clipping, overlap,
  missing logo/glyphs, broken borders, unexpected page count, or guidance text.
