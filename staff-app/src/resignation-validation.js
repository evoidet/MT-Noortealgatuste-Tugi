import { z } from 'zod';
import { validDate, tallinnToday, noticeInfo } from '../public/resignation-values.js';
const text = max => z.string().trim().max(max).default('');
const date = z.string().refine(v => !v || validDate(v), 'Sisestage kehtiv kuupäev.').default('');
export const resignationSchema = z.object({
  employeeName: text(200), position: text(200), contractDate: date,
  contractType: z.enum(['indefinite', 'fixed']).default('indefinite'), replacement: z.boolean().default(false),
  email: z.string().trim().max(254).refine(v => !v || z.email().safeParse(v).success, 'Sisestage kehtiv e-posti aadress.').default(''),
  employmentConfirmed: z.boolean().default(false),
  terminationType: z.enum(['ordinary', 'probation', 'extraordinary']).default('ordinary'),
  documentDate: date, submissionDate: date, receiptDate: date, lastDay: date,
  probationStart: date, probationEnd: date, probationConfirmed: z.boolean().default(false),
  reason: text(8000), shortNoticeAcknowledged: z.boolean().default(false),
  extraordinaryAcknowledged: z.boolean().default(false), demonstration: z.boolean().default(false)
}).strict();
export function validateResignation(input, { final = false, submitting = false, today = tallinnToday() } = {}) {
  const parsed = resignationSchema.safeParse(input);
  const issues = parsed.success ? [] : parsed.error.issues.map(i => ({ field: i.path.join('.'), message: i.message.startsWith('Sisestage') ? i.message : 'Kontrollige välja väärtust.' }));
  if (!parsed.success) throw invalid(issues);
  const d = parsed.data;
  if (!final) return d;
  const require = (ok, field, message) => { if (!ok) issues.push({ field, message }); };
  require(/^[\p{L}\p{M}][\p{L}\p{M} .’'\-]* [\p{L}\p{M} .’'\-]+$/u.test(d.employeeName), 'employeeName', 'Sisestage ees- ja perekonnanimi.');
  require(!/[\r\n]/.test(d.position), 'position', 'Sisestage ametikoht ühel real.');
  require(d.employmentConfirmed, 'employmentConfirmed', 'Kinnitage, et avaldus puudutab töölepingut. Liikmesuse, juhatuse liikme või teenuslepingu lõpetamiseks kasutage teist dokumenti.');
  require(Boolean(d.documentDate), 'documentDate', 'Sisestage avalduse koostamise kuupäev.');
  require(!d.documentDate || d.documentDate <= today, 'documentDate', 'Avalduse koostamise kuupäev ei saa olla tulevikus.');
  require(Boolean(d.lastDay), 'lastDay', 'Sisestage viimane tööpäev.');
  require(!d.lastDay || d.lastDay >= today, 'lastDay', 'Tagasiulatuvat ülesütlemist ei saa selle vormiga koostada.');
  require(!d.lastDay || !d.documentDate || d.lastDay >= d.documentDate, 'lastDay', 'Viimane tööpäev ei saa eelneda avalduse kuupäevale.');
  require(!d.contractDate || d.contractDate <= d.documentDate, 'contractDate', 'Töölepingu kuupäev ei saa olla avalduse kuupäevast hilisem.');
  for (const key of ['submissionDate', 'receiptDate']) {
    require(!d[key] || d[key] <= today, key, 'Tegelik esitamise või kättesaamise kuupäev ei saa olla tulevikus.');
    require(!d[key] || !d.lastDay || d[key] <= d.lastDay, key, 'Kuupäev ei saa olla viimasest tööpäevast hilisem.');
  }
  require(!d.receiptDate || !d.submissionDate || d.receiptDate >= d.submissionDate, 'receiptDate', 'Kättesaamine ei saa eelneda esitamisele.');
  if (d.terminationType === 'ordinary') require(d.contractType !== 'fixed' || d.replacement, 'contractType', 'TLS § 85 lg 2 lubab tähtajalise töölepingu korralist ülesütlemist üksnes töötaja asendamise ajaks sõlmitud lepingu puhul.');
  const notice = noticeInfo(d, today);
  if (d.terminationType === 'probation') {
    require(d.probationConfirmed && Boolean(d.probationStart && d.probationEnd), 'probationConfirmed', 'Kontrollige töölepingu järgi katseaja tegelikku kestust, kokkuleppeid ja peatumisi ning kinnitage katseaja kehtivus.');
    require(d.probationStart <= notice.base && d.probationEnd >= notice.base, 'probationEnd', 'Avaldus peab jõudma tööandjani kehtiva katseaja jooksul.');
  }
  if (d.terminationType === 'extraordinary') {
    require(Boolean(d.reason), 'reason', 'Kirjeldage erakorralise ülesütlemise tegelikke asjaolusid.');
    require(d.extraordinaryAcknowledged, 'extraordinaryAcknowledged', 'Kinnitage, et mõistate: mõjuvat põhjust ja etteteatamata jätmise õigust süsteem ei tuvasta (TLS § 91 ja § 98 lg 2).');
  }
  require(!notice.short || d.shortNoticeAcknowledged, 'shortNoticeAcknowledged', 'Lühem etteteatamine ei muuda avaldust automaatselt tühiseks, kuid võib kaasa tuua hüvitise või kahju nõude. Kinnitage, et mõistate seda.');
  for (const key of ['employeeName', 'position', ...(d.terminationType === 'extraordinary' ? ['reason'] : [])]) require(!/\[[^\]]+\]|\{\{|<[^>]*>|\b(?:Eesnimi Perekonnanimi|Nimi Perekonnanimi)\b/i.test(d[key]) && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(d[key]), key, 'Eemaldage täitmata kohatäited, märgendid ja juhtmärgid.');
  if (submitting) require(!d.demonstration && d.employeeName !== 'Mari Näidis', 'demonstration', 'Näidisdokumenti ei saa esitada.');
  if (issues.length) throw invalid(issues);
  return d;
}
function invalid(issues) { return Object.assign(new Error('Kontrollige avalduse andmeid.'), { status: 422, issues }); }
