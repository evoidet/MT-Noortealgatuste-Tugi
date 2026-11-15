import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import { AlignmentType, Document, Packer, Paragraph, TextRun } from 'docx';

const margin = 57;
const fonts = new URL('../private/templates/documents/financial/', import.meta.url);

export function generateResignationPdf(document) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin, info: { Title: document.title } });
    const chunks = [];
    pdf.on('data', chunk => chunks.push(chunk));
    pdf.on('error', reject);
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.registerFont('body', fileURLToPath(new URL('DejaVuSans.ttf', fonts)));
    pdf.registerFont('bold', fileURLToPath(new URL('DejaVuSans-Bold.ttf', fonts)));
    pdf.fillColor('black').font('body').fontSize(11);
    for (const line of ['Saaja: ' + document.recipient, ...document.address]) pdf.text(line, { lineGap: 3 });
    pdf.moveDown(1.4);
    for (const line of document.applicant) pdf.text(line, { lineGap: 3 });
    pdf.moveDown(1.6).font('bold').fontSize(14).text(document.title, { align: 'center', lineGap: 4 });
    pdf.moveDown(0.8).font('body').fontSize(11);
    // Leave room for the signature below the final text on whichever page it ends.
    const bodyBottom = margin + 44;
    const reserveSignature = () => { pdf.page.margins.bottom = bodyBottom; };
    reserveSignature();
    pdf.on('pageAdded', reserveSignature);
    for (const paragraph of document.paragraphs) {
      pdf.text(paragraph, { lineGap: 3 });
      pdf.moveDown(0.8);
    }
    pdf.off('pageAdded', reserveSignature);
    pdf.page.margins.bottom = margin;
    pdf.moveDown().text(document.signature);
    pdf.end();
  });
}

export function generateResignationDocx(document) {
  const line = (text, { after = 65, before = 0, bold = false, size = 22, center = false, keepNext = false } = {}) =>
    new Paragraph({
      alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT, keepNext, spacing: { before, after, line: 285 },
      children: text.split('\n').map((part, i) => new TextRun({ text: part, break: i ? 1 : 0, bold, size })),
    });
  return Packer.toBuffer(new Document({
    title: document.title,
    styles: { default: { document: { run: { font: 'Aptos', size: 22 } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1140, right: 1140, bottom: 1140, left: 1140 } } },
      children: [
        ...['Saaja: ' + document.recipient, ...document.address].map(text => line(text, { keepNext: true })),
        ...document.applicant.map((text, i) => line(text, { before: i === 0 ? 320 : 0, keepNext: true })),
        line(document.title, { bold: true, size: 28, before: 400, after: 250, center: true, keepNext: true }),
        ...document.paragraphs.map((text, i) => line(text, { after: 180, keepNext: i === document.paragraphs.length - 1 })),
        line(document.signature, { before: 200 }),
      ],
    }],
  }));
}
