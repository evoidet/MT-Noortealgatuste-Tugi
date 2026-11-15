// Synthetic local QA only. No mail, auth or database access.
import { mkdir, writeFile } from 'node:fs/promises';
import { generateResignationPdf, generateResignationDocx } from '../src/resignation-pdf.js';
import { validateResignation } from '../src/resignation-validation.js';
import { departureDocument } from '../public/resignation-values.js';
import { organization } from '../src/organization.js';

const output = new URL('../private/generated/resignation-review/', import.meta.url);
await mkdir(output, { recursive: true });
const data = validateResignation({ name: 'Õie Ööäär', email: 'test@example.test', noticeDate: '2026-11-16', actions: [
  { kind: 'board', role: 'Finantsjuht', boardCount: 3, effectiveDate: '2026-11-30' },
  { kind: 'member' },
  { kind: 'volunteer', role: 'Ürituste korraldamine ja külaliste juhendamine', writtenAgreement: true, effectiveDate: '2026-12-01',
    explanation: 'Näidistekst pikema selgituse paigutuse kontrollimiseks. Kokkulepitud töövahendid antakse üle järgmise ürituse eel. '.repeat(17) },
  { kind: 'mandate', actualAgreement: true, termsReviewed: true, party: 'provider', alternativePerformance: true,
    contractDate: '2026-02-01', contractNumber: 'TEST-01', contractTerms: 'Lepingu järgi tuleb ette teatada 14 kalendripäeva.',
    termination: 'ordinary', contractTerm: 'indefinite', receiptDate: '2026-11-17', noticeDays: 14, effectiveDate: '2026-12-01' },
] }, { final: true });

for (const action of data.actions) {
  const doc = departureDocument(data, action, organization);
  await writeFile(new URL(action.kind + '.pdf', output), await generateResignationPdf(doc));
  await writeFile(new URL(action.kind + '.docx', output), await generateResignationDocx(doc));
}
console.log('Generated four synthetic departure PDF/DOCX pairs.');
