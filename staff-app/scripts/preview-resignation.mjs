// Synthetic local QA only. No mail, auth, environment files or database access.
import { mkdir, writeFile } from 'node:fs/promises';
import { generateResignationPdf } from '../src/resignation-pdf.js';
import { validateResignation } from '../src/resignation-validation.js';
import { organization } from '../src/organization.js';
const output = new URL('../private/generated/resignation-review/', import.meta.url);
await mkdir(output, { recursive: true });
const base = { employeeName: 'Õie Ööäär', documentDate: '2026-11-10', receiptDate: '2026-11-10', employmentConfirmed: true, demonstration: true };
const examples = {
  ordinary: { ...base, lastDay: '2026-12-10' },
  probation: { ...base, terminationType: 'probation', lastDay: '2026-11-25', probationStart: '2026-10-01', probationEnd: '2027-01-31', probationConfirmed: true },
  extraordinary: { ...base, terminationType: 'extraordinary', lastDay: '2026-11-10', extraordinaryAcknowledged: true,
    reason: 'See on väljamõeldud näidistekst, mitte väide tegeliku tööandja kohta. Töötasu maksmisega on minu hinnangul oluliselt viivitatud. '.repeat(35) }
};
for (const [name, input] of Object.entries(examples)) {
  const data = validateResignation(input, { final: true, today: '2026-11-10' });
  await writeFile(new URL(`${name}.pdf`, output), await generateResignationPdf(data, organization));
}
console.log('Created three synthetic resignation PDFs for local review.');
