import { readFile } from 'node:fs/promises';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { money, dateText, sellerContactLines, sellerVatDescription, termLabels } from '../public/financial-values.js';
import { invoiceFields } from './invoice-layout.js';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const financialFileStem = (number) => number.replace(/[^\w.-]/g, '_');
export const financialFilename = (record) => `${record.kind === 'invoice' ? 'Arve' : 'Hinnapakkumine'}_${financialFileStem(record.number)}.docx`;
function quotationFields(record) {
  const { data: d, issuer: o } = record;
  const value = (v) => String(v || '—');
  const amount = (n) => money(n).replace(/\s*€/g, '').trim();
  const items = d.items.map((item, i) => ({
    index: String(i + 1), description: item.description, quantity: String(item.quantity).replace('.', ','),
    unit: item.unit, unitPrice: amount(Math.round(Number(String(item.unitPrice).replace(',', '.')) * 100)),
    lineTotal: amount(d.totals.lines[i]),
  }));
  while (items.length < 3) items.push({ index: '', description: '', quantity: '', unit: '', unitPrice: '', lineTotal: '' });
  return {
    reference: value(d.reference),
    number: record.number, date: dateText(d.date), dueDate: dateText(d.dueDate), currency: d.currency,
    execution: value(d.execution),
    project: value([d.project, record.correction_number ? `Parandus: ${record.correction_number}` : ''].filter(Boolean).join('\n')),
    sellerName: o.name, sellerRegistry: o.registrationCode, sellerAddress: o.address, sellerEmail: o.email,
    sellerContacts: sellerContactLines(o).join('\n'),
    customer: d.customer, registrationCode: value(d.registrationCode), address: d.address,
    buyerContactPerson: d.contact ? `Kontaktisik: ${d.contact}` : '',
    buyerChannels: [d.email && `E-post: ${d.email}`, d.phone && `Telefon: ${d.phone}`].filter(Boolean).join(' / '),
    items, subtotal: money(d.totals.subtotal), vat: o.vatRegistered ? `${o.vatRate}% · ${money(d.totals.vat)}` : 'Ei lisandu', total: money(d.totals.total),
    iban: o.iban, bic: o.bic, bank: o.bank,
    footerVat: sellerVatDescription(o),
    footerBank: `${o.name}  |  ${o.bank}  |  IBAN: ${o.iban}  |  BIC/SWIFT: ${o.bic}`,
    ...Object.fromEntries(Object.keys(termLabels).map(k => [k, value(d.terms?.[k])])),
  };
}

export async function generateFinancialDocx(record) {
  if (!['invoice', 'quotation'].includes(record.kind)) throw new Error('Invalid financial document kind');
  const fields = record.kind === 'invoice' ? invoiceFields(record) : quotationFields(record);
  const source = await readFile(new URL(`../private/templates/documents/financial/${record.kind}.docx`, import.meta.url));
  const template = new Docxtemplater(new PizZip(source), { paragraphLoop: true, linebreaks: true });
  template.render(fields);
  return template.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
