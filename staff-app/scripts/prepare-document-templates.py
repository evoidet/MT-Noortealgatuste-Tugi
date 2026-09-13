#!/usr/bin/env python3
"""Prepare private DOCX templates from their approved canonical sources.

Invoices retain their existing reference-DOCX preparation. Expense reports use
the checked-in reusable template matched to kuluaruanne-KA-6559A6AD.docx.pdf;
the obsolete expense example document is no longer a preparation source.
"""

from __future__ import annotations

import argparse
import hashlib
import shutil
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import RGBColor


DEFAULT_INVOICE_SOURCE = Path.home() / "Downloads" / "MTU_Noortealgatuste_Tugi_arve_naidis.docx"
DEFAULT_OUTPUT_ROOT = Path(__file__).resolve().parents[1] / "private" / "templates" / "documents"
DEFAULT_EXPENSE_SOURCE = DEFAULT_OUTPUT_ROOT / "kuluaruanne" / "kuluaruanne.docx"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def remove_element(element) -> None:
    parent = element.getparent()
    if parent is not None:
        parent.remove(element)


def remove_paragraph(paragraph) -> None:
    remove_element(paragraph._p)


def remove_table(table) -> None:
    remove_element(table._tbl)


def remove_row(table, index: int) -> None:
    remove_element(table.rows[index]._tr)


def set_run_plain(run, *, bold: bool | None = None, color: str = "111111") -> None:
    run.bold = bold
    run.italic = False
    run.font.color.rgb = RGBColor.from_string(color)


def set_paragraph_text(paragraph, text: str, *, bold: bool | None = None, color: str = "111111") -> None:
    """Replace visible text while preserving paragraph and first-run geometry."""
    runs = paragraph.runs
    if not runs:
        run = paragraph.add_run()
    else:
        run = runs[0]
        for extra in runs[1:]:
            remove_element(extra._r)
    run.text = text
    set_run_plain(run, bold=bold, color=color)


def set_paragraph_runs(paragraph, parts: list[tuple[str, bool]]) -> None:
    for run in list(paragraph.runs):
        remove_element(run._r)
    for text, bold in parts:
        run = paragraph.add_run(text)
        set_run_plain(run, bold=bold)


def set_cell_tag(cell, tag: str, *, bold: bool | None = None, color: str = "111111") -> None:
    set_paragraph_text(cell.paragraphs[0], tag, bold=bold, color=color)


def set_update_fields(document: Document) -> None:
    settings = document.settings._element
    update = settings.find(qn("w:updateFields"))
    if update is None:
        update = OxmlElement("w:updateFields")
        settings.append(update)
    update.set(qn("w:val"), "true")


def prepare_invoice(source: Path, destination: Path) -> None:
    document = Document(source)

    # The first section is a sample cover containing only a giant "ARVE".
    # Its section properties live on the first body paragraph; removing that
    # paragraph makes the real invoice page the only section/page.
    remove_paragraph(document.paragraphs[0])

    header, metadata, parties, items, totals, payment = document.tables

    metadata_tags = {
        (0, 1): "{invoiceNumber}",
        (0, 3): "{invoiceDate}",
        (1, 1): "{dueDate}",
        (1, 3): "{currency}",
        (2, 1): "{transactionTime}",
        (2, 3): "{projectReference}",
    }
    for (row, column), tag in metadata_tags.items():
        set_cell_tag(metadata.cell(row, column), tag)

    buyer = parties.cell(0, 1)
    set_paragraph_text(buyer.paragraphs[1], "{buyerName}", bold=True)
    set_paragraph_runs(buyer.paragraphs[2], [("Registrikood: ", False), ("{buyerRegistryCode}", False)])
    set_paragraph_runs(buyer.paragraphs[3], [("Aadress: ", False), ("{buyerAddress}", False)])
    set_paragraph_runs(buyer.paragraphs[4], [("Kontaktisik: ", False), ("{buyerContact}", False)])

    # One tagged row is duplicated by docxtemplater for any number of line items.
    for index in range(len(items.rows) - 1, 1, -1):
        remove_row(items, index)
    row = items.rows[1]
    item_tags = [
        "{#items}{number}",
        "{description}",
        "{quantity}",
        "{unit}",
        "{unitPrice}",
        "{lineTotal}{/items}",
    ]
    for cell, tag in zip(row.cells, item_tags, strict=True):
        set_cell_tag(cell, tag)

    set_cell_tag(totals.cell(0, 1), "{subtotal}", bold=True)
    set_cell_tag(totals.cell(1, 1), "{vatText}")
    set_cell_tag(totals.cell(2, 1), "{total}", bold=True, color="FFFFFF")

    payment_cell = payment.cell(0, 0)
    set_paragraph_runs(payment_cell.paragraphs[3], [("Selgitus: ", False), ("{paymentDescription}", False)])
    set_paragraph_runs(payment_cell.paragraphs[4], [("Viitenumber: ", False), ("{referenceNumber}", False)])

    for paragraph in list(document.paragraphs):
        if "T\u00c4ITMISE ABI" in paragraph.text.upper() or "KUSTUTA ENNE SAATMIST" in paragraph.text.upper():
            remove_paragraph(paragraph)

    set_update_fields(document)
    destination.parent.mkdir(parents=True, exist_ok=True)
    document.save(destination)


def prepare_expense(source: Path, destination: Path) -> None:
    """Validate and copy the canonical reusable expense report without restyling.

    The supplied PDF is the visual authority; its reusable DOCX is checked in.
    Validation deliberately rejects the old example DOCX, even if explicitly
    provided, so running preparation cannot silently restore an obsolete form.
    """
    document = Document(source)
    texts = [paragraph.text for paragraph in document.paragraphs]
    texts.extend(cell.text for table in document.tables for row in table.rows for cell in row.cells)
    text = "\n".join(texts)
    required = {
        "6. MTÜ kinnitus ja finantsjuhi allkiri",
        "{documentNumberAndDate}", "{recipientName}", "{recipientRole}",
        "{contactAccountIban}", "{activityName}", "{expenseType}",
        "{locationPeriodRoute}", "{fundingSource}", "{whereWhen}",
        "{activitiesAndRole}", "{necessity}", "{result}", "{participants}",
        "{#items}", "{description}", "{date}", "{documentReference}",
        "{grossAmount}", "{requestedAmount}", "{excludedAmount}", "{/items}",
        "{grossTotal}", "{requestedTotal}", "{excludedTotal}", "{iban}",
        "{signatureStatus}", "{signatureDate}", "{#attachments}", "{name}", "{/attachments}",
        "{financeApproverName}", "{financeApproverRole}",
        "{financeSignatureStatus}", "{financeSignatureDate}",
        "Kinnitan esitatud kuluaruande kontrollimise ja taotletud {requestedTotal} hüvitamise.",
        "Käesolev dokument allkirjastatakse digitaalselt ning jõustub pärast viimase nõutava digitaalallkirja andmist.",
    }
    missing = sorted(value for value in required if value not in text)
    if missing:
        raise ValueError(f"Expense source is not the current reusable template; missing: {', '.join(missing)}")
    if len(document.tables) != 5 or len(document.tables[2].columns) != 6 or len(document.tables[4].columns) != 4:
        raise ValueError("Expense source must contain the current five tables, including the four-column finance signature")
    destination.parent.mkdir(parents=True, exist_ok=True)
    if source.resolve() != destination.resolve():
        shutil.copyfile(source, destination)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--invoice-source", type=Path, default=DEFAULT_INVOICE_SOURCE)
    parser.add_argument("--expense-source", type=Path, default=DEFAULT_EXPENSE_SOURCE)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--only", choices=("invoice", "expense", "all"), default="all",
                        help="Prepare only one document type without reading or modifying the other")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    preparations = []
    if args.only in ("invoice", "all"):
        preparations.append(("Invoice", args.invoice_source, args.output_root / "arve" / "arve.docx", prepare_invoice))
    if args.only in ("expense", "all"):
        preparations.append(("Expense", args.expense_source, args.output_root / "kuluaruanne" / "kuluaruanne.docx", prepare_expense))
    for name, source, destination, prepare in preparations:
        source = source.resolve(strict=True)
        before = sha256(source)
        prepare(source, destination)
        if sha256(source) != before:
            raise RuntimeError(f"{name} source changed while preparing templates")
        print(f"{name} template: {destination.resolve()}")
        print(f"{name} source SHA-256: {before}")


if __name__ == "__main__":
    main()
