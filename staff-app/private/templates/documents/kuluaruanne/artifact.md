# Kuluaruanne source fidelity contract

## Authority and scope

- Visual authority: `C:/Users/egork/Downloads/kuluaruanne-KA-6559A6AD.docx.pdf`.
- PDF SHA-256: `54c58c34f6dda95f794d50976cafc6f193cc5ec74f9bfbd5aab7dcb3119c11fa`.
- Both source pages were rendered and inspected; text, fonts, table coordinates
  and finance-section spacing were measured with
  pdfplumber. The PDF remains unchanged and is not checked in.
- Reusable authority: the adjacent `kuluaruanne.docx`. The preparation command
  validates and copies it, without re-creating the obsolete expense document.

## Page system

- A4 portrait, 11906 × 16838 twips; one section.
- Margins: top 652, bottom 709, left/right 737 twips.
- Header/footer distances: 312/369 twips. Default header on both pages; no
  separate first-page or odd/even system. Right-aligned 8 pt header caption;
  right-aligned footer `Lehekülg PAGE / NUMPAGES` with 7.5 pt label.
- A retained explicit page break precedes the second title. Ordinary source
  density is two pages; expanded user content may flow onto additional pages.
  Row heights are minimums, so text is never clipped to a fixed height.

## Typography and components

- Times New Roman throughout. Black/near-black text (`111111`).
- Both centered titles use Word Title: 16 pt bold, single spacing, 2 pt after.
  Their 1.25 pt blue (`2F75B5`) bottom rule is intentionally retained because
  the supplied PDF explicitly defines the visual design.
- Centered subtitles: 10.5 pt bold italic, single spacing, 5 pt after.
- Numbered section headings: 12 pt bold, single spacing, keep with next;
  section-specific 4–5 pt before and 1–3 pt after match the source.
- General/activity/signature cells, declarations, attachment labels and section
  6 prose: 9 pt. Costs cells: 8.5 pt; the application sentence: 10 pt with
  requested amount and IBAN bold. Source bullet indentation: 360 twips.
- Page 1 contains title/subtitle, section 1 general table, then section 2
  activity table. Page 2 contains title/subtitle, costs, sections 3–6 and the
  final digital-signature timing paragraph, in that order.

## Tables and editable slots

Stable locations below refer to `word/document.xml`, zero-based body tables.
All tables have fixed column widths but expanding row heights; common cell
top/bottom padding is 85 twips, left/right padding 115 twips.

| Table | Grid widths in twips | Content and slots |
| --- | --- | --- |
| 0 General | 2760 / 7680 | 11 rows; source labels and organization/address/submission destination static. Values use documentNumberAndDate, recipientName, recipientRole, contactAccountIban, activityName, expenseType, locationPeriodRoute, fundingSource. Word minimum row heights 219/431/219/219/219/225/219/219/219/225/219 twips; gray E7E6E6 labels. |
| 1 Activity | 2700 / 7740 | Five rows: whereWhen, activitiesAndRole, necessity, result, participants. Word minimum row height 579 twips; gray E7E6E6 labels. |
| 2 Costs | 2895 / 1440 / 1365 / 1695 / 1485 / 1620 | Six source headers; repeated items row with description, date, documentReference, grossAmount, requestedAmount, excludedAmount. Word minimum heights: header 694, item 406, total 258 twips. Total uses grossTotal, requestedTotal, excludedTotal. Blue D9EAF7 header/total rows; amounts right aligned. |
| 3 Applicant signature | 3600 / 3440 / 3400 | Source headers, then recipientName, signatureStatus, signatureDate. Blue D9EAF7 header, automatic row height. |
| 4 Finance signature | 2595 / 1800 / 3405 / 2640 | Source headers Kinnitaja nimi / Amet / Allkiri / Kuupäev, then financeApproverName / financeApproverRole / financeSignatureStatus / financeSignatureDate. Blue D9EAF7 header, automatic row height. |

The application sentence uses requestedTotal and iban. Attachments remain the
existing paragraph loop `attachments` with each `name`; no completed-example
attachment or personal submission value is retained. Section 6 confirmation
reuses requestedTotal. The static final paragraph is the source's exact text
about the last required digital signature and its timestamp.

The imported Word minimum row heights exclude added cell margins and borders.
Their values compensate for that spacing so the rendered outer row heights
match the PDF: approximately 20.2 pt for ordinary general rows, 30.8 pt for the
organization row, 38.2 pt for narrative rows and 43.6/29.2/21.8 pt for cost
header/item/total rows. They remain minimums, not fixed heights. The finance
signature row keeps with the final signing paragraph to avoid an orphan page.

## Package preservation and verification

Only `word/document.xml` needs modification for the replacement. Preserve all
other package parts byte-for-byte: content types, package and document
relationships, theme, settings, font table and its relationships, embedded
NotoSansSymbols fonts, numbering, header, footer and styles. Existing PAGE and
NUMPAGES fields are preserved, with updateFields already enabled. There are
no drawings, text boxes, comments, custom XML or content controls.

Useful invariant hashes:

- `word/styles.xml`: `d72f42cec06866a2b0ede25b4bbade4f46b4594dc9aafa6930f2e68e98c3a97d`
- `word/header1.xml`: `95ecb5110aaeea638a86f1355837e1b7540108966317298d2b0395c0858b15b1`
- `word/footer1.xml`: `b128b01c8ed6e19ff1529ad4b3c89298d5e15ef9685728d3ed697a46286e0c94`
- `word/numbering.xml`: `ba6817e545e76daa209c6825e020dd564cf82f2d1d41bcd764978921bd50329c`

Verification on 2026-09-13 used Microsoft Word PDF export and inspection of all
13 rendered pages across four synthetic submissions: ordinary and empty optional
fields (two pages each), maximum supported narrative lengths (five pages), and
50 cost rows (four pages). Tables grow and continue without clipping; cost
headers repeat; digital-signature sections, totals, Estonian characters and
footer page counts remain intact. A character-count comparison also confirmed
that every DOCX body character survives PDF rendering. Browser previews were
checked at 320, 390, 768 and 1440 px; their responsive sections are labelled as
preview parts because final DOCX pagination can differ.

The supplied PDF's attachment hyperlink is rendered
as the existing dynamic attachment filename list: it does not imply a public
URL for private files.
