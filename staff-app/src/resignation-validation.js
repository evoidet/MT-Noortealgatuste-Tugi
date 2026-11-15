import { z } from 'zod';
import { addDays, addMonths, validDate } from '../public/resignation-values.js';

const text = max => z.string().trim().max(max)
  .refine(value => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/u.test(value), 'Eemaldage tekstist sobimatud märgid.').default('');
const date = z.string().refine(validDate, 'Sisestage kehtiv kuupäev.');
const optionalDate = z.union([date, z.literal('')]).default('');
const optionalNumber = (min, max) => z.number().int().min(min).max(max).optional();
const common = {
  role: text(240), effectiveDate: optionalDate, reason: text(2400), explanation: text(2400),
};
const action = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('board'), ...common, appointingBody: text(180), boardCount: optionalNumber(1, 99) }).strict(),
  z.object({ kind: z.literal('member'), ...common }).strict(),
  z.object({ kind: z.literal('volunteer'), ...common, writtenAgreement: z.boolean().default(false) }).strict(),
  z.object({
    kind: z.literal('mandate'), ...common, actualAgreement: z.boolean().default(false),
    termsReviewed: z.boolean().default(false), alternativePerformance: z.boolean().default(false),
    contractDate: optionalDate, contractNumber: text(100), contractTerms: text(1800),
    party: z.enum(['', 'provider', 'client']).default(''),
    termination: z.enum(['', 'ordinary', 'extraordinary']).default(''),
    contractTerm: z.enum(['', 'indefinite', 'fixed', 'long']).default(''),
    ordinaryClause: z.boolean().default(false),
    noticeDays: optionalNumber(0, 3650), receiptDate: optionalDate,
  }).strict(),
]);
const schema = z.object({
  name: text(160), email: z.union([z.email().max(254), z.literal('')]).default(''),
  noticeDate: date,
  actions: z.array(action).min(1).max(4),
}).strict().refine(data => new Set(data.actions.map(entry => entry.kind)).size === data.actions.length,
  'Valige iga avalduse liik üks kord.');

export function validateResignation(input, { final = false } = {}) {
  const data = schema.parse(input);
  if (!final) return data;
  const issue = message => { throw Object.assign(new Error(message), { status: 422 }); };
  if (!data.name || !data.email) issue('Sisestage avalduse esitaja nimi ja e-posti aadress.');
  for (const entry of data.actions) {
    if (entry.effectiveDate && entry.effectiveDate < data.noticeDate)
      issue('Soovitud lõppkuupäev peab olema avalduse kuupäeval või hiljem.');
    if (entry.kind === 'volunteer' && !entry.role) issue('Kirjeldage vabatahtliku rolli või ülesandeid.');
    if (entry.kind !== 'mandate') continue;
    if (!entry.actualAgreement || !entry.termsReviewed || !entry.contractDate || !entry.party || !entry.contractTerm ||
        !entry.termination || !entry.effectiveDate || !entry.contractTerms || !entry.receiptDate || entry.noticeDays == null)
      issue('Käsunduslepingu avalduseks täitke lepingu ja etteteatamise andmed ning kinnitage nende kontrollimine.');
    if (entry.contractDate > data.noticeDate || entry.receiptDate < data.noticeDate)
      issue('Kontrollige lepingu sõlmimise, avalduse ja eeldatava kättesaamise kuupäevi.');
    if (entry.termination === 'ordinary') {
      if (entry.contractTerm === 'long' && entry.party === 'provider' && !entry.ordinaryClause) {
        if (entry.receiptDate < addMonths(entry.contractDate, 60) || entry.effectiveDate < addMonths(entry.receiptDate, 6))
          issue('VÕS § 630 lg 3 järgi kontrollige viie aasta möödumist ja jätke vähemalt kuus kuud etteteatamiseks.');
      } else if (entry.contractTerm !== 'indefinite' && !entry.ordinaryClause) {
        issue('Tähtajalise käsunduslepingu korraliseks ülesütlemiseks kontrollige lepingus sätestatud õigust.');
      }
      if (entry.party === 'provider' && entry.contractTerm === 'indefinite' && !entry.alternativePerformance)
        issue('Käsundisaajana kontrollige VÕS § 630 lg 2 kohaselt, kas käsundiandja saab teenuse või tehingu korraldada muul viisil.');
    } else if (!entry.reason) issue('Kirjeldage erakorralise ülesütlemise asjaolusid.');
    if (entry.effectiveDate < addDays(entry.receiptDate, entry.noticeDays))
      issue('Soovitud lõppkuupäev on varasem kui sisestatud etteteatamistähtaja lõpp.');
  }
  return data;
}
