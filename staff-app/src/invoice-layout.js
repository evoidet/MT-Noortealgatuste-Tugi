import { dateText, decimalUnits, money, termLabels } from '../public/financial-values.js';

export const invoiceLabels = {
  number: 'Arve number', date: 'Arve kuupäev', dueDate: 'Maksetähtaeg', currency: 'Valuuta',
  execution: 'Teenuse periood', project: 'Projekti / lepingu\nviide', reference: 'Viide', referenceNumber: 'Viitenumber',
  index: 'Nr', description: 'Kauba / teenuse\nkirjeldus', quantity: 'Kogus /\nmaht', unit: 'Ühik',
  unitPrice: 'Ühiku hind\n(€)', lineTotal: 'Summa\n(€)',
  subtotal: 'Summa', vat: 'Käibemaks', total: 'TASUDA KOKKU',
};
export const invoiceInfoRows = [
  ['number', 'date'], ['dueDate', 'currency'], ['execution', 'project'], ['reference', 'referenceNumber'],
];
export const invoiceItemColumns = ['index', 'description', 'quantity', 'unit', 'unitPrice', 'lineTotal'];
export const invoiceTotalRows = ['subtotal', 'vat', 'total'];

export function invoiceFields({ data: d, issuer: o, number, correction_number }) {
  const value = (v) => v || '—';
  const amount = (n) => money(n).replace(/\s*€/g, '').trim();
  const items = d.items.map((item, i) => ({
    index: String(i + 1),
    description: item.description,
    quantity: String(item.quantity).replace('.', ','),
    unit: item.unit,
    unitPrice: amount(Number(decimalUnits(item.unitPrice))),
    lineTotal: amount(d.totals.lines[i]),
  }));
  const explanation = [...new Set([`Arve ${number}`, d.explanation?.trim()].filter(Boolean))].join(' · ');
  return {
    ...Object.fromEntries(Object.entries(invoiceLabels).map(([key, label]) => [key + 'Label', label])),
    number, date: dateText(d.date) || d.date, dueDate: dateText(d.dueDate) || d.dueDate, currency: d.currency,
    execution: value(d.execution || dateText(d.supplyDate)),
    project: value([d.project, correction_number && `Parandus: ${correction_number}`].filter(Boolean).join('\n')),
    reference: value(d.reference), referenceNumber: value(d.referenceNumber),
    sellerName: o.name,
    sellerDetails: [`Registrikood: ${o.registrationCode}`, `Aadress: ${o.address}`, `E-post: ${o.email}`].join('\n'),
    customer: d.customer,
    buyerDetails: [
      `Registrikood: ${value(d.registrationCode)}`, `Aadress: ${value(d.address)}`,
      d.contact && `Kontaktisik: ${d.contact}`, d.email && `E-post: ${d.email}`, d.phone && `Telefon: ${d.phone}`,
    ].filter(Boolean).join('\n'),
    items, subtotal: money(d.totals.subtotal),
    vat: o.vatRegistered ? `${String(o.vatRate).replace('.', ',')}% · ${money(d.totals.vat)}` : 'Ei lisandu',
    total: money(d.totals.total),
    recipientLine: `Saaja: ${o.name}`,
    bankLine: `IBAN: ${o.iban}    |    BIC/SWIFT: ${o.bic}    |    Pank: ${o.bank}`,
    explanationLine: `Selgitus: ${explanation}`,
    paymentDetails: [
      `Viitenumber: ${value(d.referenceNumber)}`,
      `Maksetähtaeg: ${dateText(d.dueDate) || d.dueDate}`,
      d.referenceNumber
        ? 'Makse selgitusse palume märkida arve number ning viitenumber sisestada makse viitenumbri väljale.'
        : 'Makse selgitusse palume märkida arve number.',
      d.additionalInfo && d.additionalInfo !== d.explanation ? d.additionalInfo : '',
      ...Object.entries(termLabels).filter(([key]) => d.terms?.[key]).map(([key, label]) => `${label}: ${d.terms[key]}`),
    ].filter(Boolean).join('\n'),
    footerVat: o.vatRegistered
      ? [o.vatNumber && `Käibemaksukohustuslase number: ${o.vatNumber}.`, 'Täname õigeaegse tasumise eest!'].filter(Boolean).join(' ')
      : 'Käibemaksu ei lisandu, sest müüja ei ole käibemaksukohustuslane. Täname õigeaegse tasumise eest!',
  };
}
