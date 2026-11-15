// Offline only: synthetic records, no database/configuration/mail imports.
import { mkdir, writeFile } from 'node:fs/promises';
import { generateFinancialPdf } from '../src/financial-pdf.js';
import { generateFinancialDocx } from '../src/financial-docx.js';
import { validateFinancialData } from '../src/financial-validation.js';
import { organization } from '../src/organization.js';
const root = new URL('../private/generated/financial-docx/', import.meta.url);
await mkdir(root, { recursive: true });
const issuer = { ...organization, vatRegistered: false, vatRate: 0, vatNumber: '' };
for (const kind of ['invoice', 'quotation']) {
  for (const long of [false, true]) {
    const data = validateFinancialData({
      reference: 'Noorteüritus / kokkulepe 2026-10', referenceNumber: kind === 'invoice' ? '1234561' : '',
      date: '2026-10-29', dueDate: '2026-11-05', supplyDate: '2026-10-20', execution: '20.10.2026',
      customer: long ? 'Sünteetiline Ida-Virumaa Noorte Haridus- ja Kultuurialgatuste Koostöökeskus ÕÄÖÜ' : 'Testklient ÕÄÖÜ',
      address: 'Testi tänav 1, Tallinn', registrationCode: '12345678', contact: 'Testisik', email: 'test@example.test',
      phone: long ? '+372 5550 0100' : '', project: long
        ? 'Ida-Virumaa noorte osaluse, koostöö ning haridus- ja kultuurialgatuste arendamise programm'
        : 'Testprojekt',
      items: Array.from({ length: long ? 14 : kind === 'invoice' ? 1 : 3 }, (_, i) => ({
        description: long ? `Teenus ${i + 1}: noorteürituse korraldamine, osalejate nõustamine ning mitmekeelne kommunikatsioon ja tegevuste kokkuvõtte koostamine.` : kind === 'invoice'
          ? 'Noorteürituse ettevalmistamine ja korraldamine, osalejate juhendamine ning ürituse kokkuvõte'
          : ['Korraldamine', 'Kommunikatsioon', 'Materjalid'][i],
        quantity: '1', unit: 'teenus', unitPrice: '500',
      })),
      terms: kind === 'quotation' ? {
        costs: '1500€ kokku korraldamise ja kommunikatsiooni eest.',
        changes: 'Muudatused saadetakse eelnevalt e-posti teel.',
        payment: '100% pärast täitmist, 14 päeva arve kuupäevast',
        delivery: 'e-rahaülekanne', confirmation: 'Saatke nõustumus aadressile juhatus@noortetugi.ee.',
      } : {
        delivery: 'Testkeskus, Tallinn',
        costs: 'Kõik kulud sisalduvad hinnas.',
        payment: 'Tasumine 14 päeva jooksul arve esitamisest.',
        confirmation: 'Kinnitus saadetakse e-posti teel.',
        changes: 'Muudatused lepitakse eelnevalt kokku.',
      },
    }, issuer, true);
    if (long) data.terms.costs = 'Kõik kulud sisalduvad kogumaksumuses.';
    const record = { kind, number: kind === 'invoice' ? 'NT-AR-TEST-001' : 'TEST-quotation-001', data, issuer };
    const filename = `${kind}${long ? '-long' : ''}`;
    await writeFile(new URL(filename + '.docx', root), await generateFinancialDocx(record));
    if (kind === 'invoice') await writeFile(new URL(filename + '.pdf', root), await generateFinancialPdf(record));
  }
}
console.log('Generated invoice pairs and Word quotation specimens. No records created or emails sent.');
