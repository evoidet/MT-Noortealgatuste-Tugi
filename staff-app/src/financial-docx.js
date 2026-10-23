import { readFile } from 'node:fs/promises';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { money, dateText, termLabels } from '../public/financial-values.js';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const financialFilename = (record) => `${record.kind === 'invoice' ? 'Arve' : 'Hinnapakkumine'}_${record.number.replace(/[^\w.-]/g, '_')}.docx`;
export async function generateFinancialDocx(record) {
  if (!['invoice', 'quotation'].includes(record.kind)) throw new Error('Invalid financial document kind');
  const { data: d, issuer: o } = record;
  const value = (v) => String(v || '—');
  const amount = (n) => money(n).replace(/\s*€/g, '').trim();
  const items = d.items.map((item, i) => ({
    index: String(i + 1), description: item.description, quantity: String(item.quantity).replace('.', ','),
    unit: item.unit, unitPrice: amount(Math.round(Number(String(item.unitPrice).replace(',', '.')) * 100)),
    lineTotal: amount(d.totals.lines[i]),
  }));
  while (items.length < 3) items.push({ index: '', description: '', quantity: '', unit: '', unitPrice: '', lineTotal: '' });
  const fields = {
    number: record.number, date: dateText(d.date), dueDate: dateText(d.dueDate), currency: d.currency,
    execution: value(record.kind === 'invoice' ? dateText(d.supplyDate) || d.execution : d.execution),
    project: value([d.project, record.correction_number ? `Parandus: ${record.correction_number}` : ''].filter(Boolean).join('\n')),
    sellerName: o.name, sellerRegistry: o.registrationCode, sellerAddress: o.address, sellerEmail: o.email, sellerPhone: value(o.phone),
    customer: d.customer, registrationCode: value(d.registrationCode), address: d.address, contact: value(d.contact),
    customerContact: value([d.email,d.phone].filter(Boolean).join(' / ')), invoiceContact: value([d.contact,d.email,d.phone].filter(Boolean).join(' / ')),
    items, subtotal: money(d.totals.subtotal), vat: o.vatRegistered ? `${o.vatRate}% · ${money(d.totals.vat)}` : 'Ei lisandu', total: money(d.totals.total),
    iban: o.iban, bic: o.bic, bank: o.bank, explanation: d.explanation || `Arve ${record.number}`, referenceNumber: value(d.referenceNumber),
    invoiceTerms: Object.entries(termLabels).filter(([k]) => d.terms?.[k]).map(([k,label]) => `\n${label}: ${d.terms[k]}`).join(''),
    footerVat: o.vatRegistered ? `Käibemaksukohustuslase number: ${o.vatNumber}. Täname õigeaegse tasumise eest!` : 'Käibemaksu ei lisandu, sest müüja ei ole käibemaksukohustuslane. Täname õigeaegse tasumise eest!',
    footerBank: `${o.name}  |  ${o.bank}  |  IBAN: ${o.iban}  |  BIC/SWIFT: ${o.bic}`,
    ...Object.fromEntries(Object.keys(termLabels).map(k => [k, value(d.terms?.[k])])),
  };
  if (record.kind === 'quotation') fields.footerVat = o.vatRegistered
    ? `Käibemaksukohustuslase number: ${o.vatNumber}.`
    : 'Käibemaksu ei lisandu, sest pakkuja ei ole käibemaksukohustuslane.';
  const source = await readFile(new URL(`../private/templates/documents/financial/${record.kind}.docx`, import.meta.url));
  const template = new Docxtemplater(new PizZip(source), { paragraphLoop: true, linebreaks: true });
  template.render(fields);
  return template.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
