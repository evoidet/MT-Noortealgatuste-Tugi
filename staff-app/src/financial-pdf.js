import PDFDocument from "pdfkit";
import { fileURLToPath } from "node:url";
import { money, dateText, termLabels } from "../public/financial-values.js";
const assets = fileURLToPath(
  new URL("../private/templates/documents/financial/", import.meta.url),
);
// Separate document structures, sharing only the reference's typography/colors/table helpers.
export const templates = Object.freeze({
  quotation: {
    title: "HINNAPAKKUMINE",
    number: "Pakkumise nr",
    due: "Kehtib kuni",
    supplier: "PAKKUJA",
    customer: "TELLIJA",
    total: "PAKKUMISE KOGUMAKSUMUS",
  },
  invoice: {
    title: "ARVE",
    number: "Arve nr",
    due: "Maksetähtaeg",
    supplier: "MÜÜJA",
    customer: "OSTJA",
    total: "KOKKU TASUDA",
  },
});
export function generateFinancialPdf(record) {
  return new Promise((resolve, reject) => {
    const d = new PDFDocument({
      size: "A4",
      margins: { top: 38, bottom: 72, left: 38, right: 38 },
      bufferPages: true,
    });
    const chunks = [];
    d.on("data", (c) => chunks.push(c));
    d.on("error", reject);
    d.on("end", () => resolve(Buffer.concat(chunks)));
    const t = templates[record.kind],
      data = record.data,
      org = record.issuer;
    d.registerFont("body", `${assets}DejaVuSans.ttf`);
    d.registerFont("bold", `${assets}DejaVuSans-Bold.ttf`);
    const left = 38,
      width = 519,
      bottom = 752;
    let y = 38;
    const font = (bold = false, size = 9) =>
      d
        .font(bold ? "bold" : "body")
        .fontSize(size)
        .fillColor("#1f2a1f");
    function room(height) {
      if (y + height > bottom) {
        d.addPage();
        y = 38;
        return true;
      }
      return false;
    }
    function paragraph(text, bold = false, size = 9) {
      font(bold, size);
      const h = d.heightOfString(text, { width, lineGap: 2 });
      if (h > bottom - 38) {
        // PDFKit flows long optional prose safely across pages with the reserved footer margin.
        d.text(text, left, y, { width, lineGap: 2 });
        y = d.y + 7;
        return;
      }
      room(h + 7);
      d.text(text, left, y, { width, lineGap: 2 });
      y += h + 7;
    }
    function band(text) {
      room(30);
      d.rect(left, y, width, 23).fill("#e9f1cb");
      font(true, 10);
      d.text(text, left + 8, y + 6, { width: width - 16 });
      y += 31;
    }
    d.image(`${assets}logo.png`, left, y, { fit: [175, 60] });
    font(true, 20);
    d.fillColor("#0e3b03").text(t.title, 240, y + 16, {
      width: 317,
      align: "right",
    });
    y += 79;
    paragraph(
      `${t.number}: ${record.number}     Kuupäev: ${dateText(data.date)}     ${t.due}: ${dateText(data.dueDate)}`,
      true,
    );
    paragraph(
      `Valuuta: EUR${data.execution ? `     Täitmise aeg: ${data.execution}` : ""}`,
    );
    if (data.project) paragraph(`Projekti / lepingu viide: ${data.project}`);
    if (record.kind === "invoice")
      paragraph(
        `Kauba / teenuse kuupäev: ${dateText(data.supplyDate || data.date)}`,
      );
    if (record.correction_of)
      paragraph(
        `Parandus dokumendile: ${record.correction_number || record.correction_of}`,
      );
    if (record.status === "DRAFT") paragraph("MUSTAND", true);
    const seller = [
      org.name,
      `Registrikood: ${org.registrationCode}`,
      org.address,
      org.email,
      org.vatRegistered
        ? `KMKR: ${org.vatNumber}`
        : "Ei ole käibemaksukohustuslane",
    ].join("\n");
    const buyer = [
      data.customer,
      data.registrationCode && `Registrikood: ${data.registrationCode}`,
      data.address,
      data.contact,
      data.email,
      data.phone,
    ]
      .filter(Boolean)
      .join("\n");
    font();
    const blockH =
      Math.max(
        d.heightOfString(seller, { width: 245, lineGap: 2 }),
        d.heightOfString(buyer, { width: 251, lineGap: 2 }),
      ) + 42;
    if (blockH > 600) {
      band(t.supplier);
      paragraph(seller);
      band(t.customer);
      paragraph(buyer);
    } else {
      room(blockH);
      font(true, 10);
      d.text(t.supplier, left, y);
      d.text(t.customer, 306, y);
      y += 20;
      font();
      d.text(seller, left, y, { width: 245, lineGap: 2 });
      d.text(buyer, 306, y, { width: 251, lineGap: 2 });
      y += blockH - 12;
    }
    const widths = [23, 221, 53, 48, 86, 88];
    function rowHeight(values, header = false) {
      font(header, 8);
      return Math.max(
        29,
        ...values.map(
          (v, i) => d.heightOfString(String(v), { width: widths[i] - 10 }) + 14,
        ),
      );
    }
    function drawRow(values, header = false) {
      const h = rowHeight(values, header);
      let x = left;
      values.forEach((v, i) => {
        d.rect(x, y, widths[i], h).fillAndStroke(
          header ? "#0e3b03" : "#f7faf0",
          "#d7dfcf",
        );
        font(header, 8);
        d.fillColor(header ? "#ffffff" : "#1f2a1f");
        d.text(String(v), x + 5, y + 7, {
          width: widths[i] - 10,
          align: i > 1 ? "right" : "left",
        });
        x += widths[i];
      });
      y += h;
    }
    const headings = ["Nr", "Kauba / teenuse kirjeldus", "Kogus", "Ühik", "Ühiku hind (€)", "Summa (€)"];
    const headerHeight = rowHeight(headings, true);
    function tableHeader() {
      room(headerHeight + 29);
      drawRow(headings, true);
    }
    function nextTablePage() {
      d.addPage();
      y = 38;
      tableHeader();
    }
    function splitCell(value, column, availableHeight) {
      font(false, 8);
      const characters = Array.from(value);
      let low = 0, high = characters.length;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        const height = d.heightOfString(characters.slice(0, mid).join(""), { width: widths[column] - 10 });
        if (height <= availableHeight - 14) low = mid;
        else high = mid - 1;
      }
      return [characters.slice(0, low).join("").trimEnd(), characters.slice(low).join("").trimStart()];
    }
    function row(values) {
      let remaining = values.map(String);
      const fullHeight = rowHeight(remaining);
      // Keep ordinary rows together; split oversized cells explicitly so PDFKit
      // cannot flow one column to another page while leaving its borders behind.
      if (fullHeight <= bottom - 38 - headerHeight && y + fullHeight > bottom)
        nextTablePage();
      do {
        if (bottom - y < 29) nextTablePage();
        const parts = remaining.map((value, i) => splitCell(value, i, bottom - y));
        drawRow(parts.map(([part]) => part));
        remaining = parts.map(([, rest]) => rest);
        if (remaining.some(Boolean)) nextTablePage();
      } while (remaining.some(Boolean));
    }
    tableHeader();
    data.items.forEach((item, i) =>
      row([
        i + 1,
        item.description,
        String(item.quantity).replace(".", ","),
        item.unit,
        money(
          Math.round(Number(String(item.unitPrice).replace(",", ".")) * 100),
        ),
        money(data.totals.lines[i]),
      ]),
    );
    y += 14;
    room(100);
    paragraph(`Summa: ${money(data.totals.subtotal)}`);
    paragraph(
      org.vatRegistered
        ? `Käibemaks ${org.vatRate}%: ${money(data.totals.vat)}`
        : "Käibemaks: ei lisandu. Pakkuja ei ole käibemaksukohustuslane.",
    );
    band(`${t.total}: ${money(data.totals.total)}`);
    if (record.kind === "invoice") {
      paragraph(`IBAN: ${org.iban}     ${org.bank}`, true);
      if (data.referenceNumber)
        paragraph(`Viitenumber: ${data.referenceNumber}`);
      paragraph(`Selgitus: ${data.explanation || record.number}`);
    }
    const terms = Object.entries(data.terms || {}).filter(([, value]) => value);
    if (terms.length) {
      font();
      const firstTerm = `${termLabels[terms[0][0]]}: ${terms[0][1]}`;
      room(31 + Math.min(100, d.heightOfString(firstTerm, { width, lineGap: 2 }) + 7));
      band(
        record.kind === "quotation"
          ? "PAKKUMISE TINGIMUSED"
          : "MAKSETINGIMUSED",
      );
      for (const [key, value] of terms)
        paragraph(`${termLabels[key]}: ${value}`);
    }
    const pages = d.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      d.switchToPage(i);
      font(false, 7);
      // Footer lives outside the flowing body. Disable automatic page creation here.
      d.page.margins.bottom = 0;
      d.moveTo(left, 773).lineTo(557, 773).strokeColor("#587580").stroke();
      d.text(
        `${org.name} · Registrikood ${org.registrationCode}\n${org.bank} · IBAN ${org.iban} · BIC/SWIFT ${org.bic}`,
        left,
        782,
        { width: 460, lineBreak: false },
      );
      d.text(`${i + 1} / ${pages.count}`, 510, 782, {
        width: 47,
        align: "right",
        lineBreak: false,
      });
    }
    d.end();
  });
}
