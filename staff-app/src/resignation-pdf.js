import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import { documentParagraphs } from '../public/resignation-values.js';

export function generateResignationPdf(data, employer) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 57, info: { Title: 'Töölepingu ülesütlemise avaldus', Author: data.employeeName } });
    const chunks = [];
    pdf.on('data', chunk => chunks.push(chunk));
    pdf.on('error', reject);
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    const fonts = new URL('../private/templates/documents/financial/', import.meta.url);
    pdf.registerFont('body', fileURLToPath(new URL('DejaVuSans.ttf', fonts)));
    pdf.registerFont('bold', fileURLToPath(new URL('DejaVuSans-Bold.ttf', fonts)));
    pdf.fillColor('black').font('body').fontSize(11);
    if (data.demonstration) { pdf.font('bold').text('NÄIDIS – EI OLE ESITAMISEKS'); pdf.moveDown(); }
    pdf.font('body').fontSize(11);
    pdf.text(`${employer.name} juhatusele`);
    if (employer.registrationCode) pdf.fontSize(9).text(`Registrikood: ${employer.registrationCode}`);
    if (employer.address) pdf.text(employer.address);
    pdf.moveDown(2).font('bold').fontSize(14).text('TÖÖLEPINGU ÜLESÜTLEMISE AVALDUS');
    pdf.moveDown().font('body').fontSize(11);
    for (const paragraph of documentParagraphs(data, employer)) {
      pdf.text(paragraph, { lineGap: 4 });
      pdf.moveDown();
    }
    pdf.end();
  });
}
