// Pure calendar and wording rules shared by the form, server, PDF and email.
export const terminationLabels = Object.freeze({ ordinary: 'Korraline ülesütlemine', probation: 'Ülesütlemine katseajal', extraordinary: 'Erakorraline ülesütlemine' });
export const tallinnToday = (now = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Tallinn' }).format(now);
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function addDays(value, days) {
  if (!validDate(value)) return '';
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export const dateText = value => validDate(value) ? value.split('-').reverse().join('.') : '';
export function noticeInfo(data, today = tallinnToday()) {
  const days = data.terminationType === 'ordinary' ? 30 : data.terminationType === 'probation' ? 15 : null;
  const base = data.receiptDate || data.submissionDate || today;
  const earliest = days === null ? '' : addDays(base, days);
  return { days, base, earliest, estimated: !data.receiptDate, short: Boolean(earliest && data.lastDay && data.lastDay < earliest) };
}
export function legalBasis(data) {
  return data.terminationType === 'probation' ? 'TLS § 86 lg 1' : data.terminationType === 'extraordinary' ? 'TLS § 91' : data.contractType === 'fixed' ? 'TLS § 85 lg 2' : 'TLS § 85 lg 1';
}
export function documentParagraphs(data, employer) {
  const manner = { ordinary: 'korraliselt', probation: 'katseajal', extraordinary: 'erakorraliselt' }[data.terminationType];
  return [
    `Mina, ${data.employeeName}, ütlen tööandjaga ${employer.name} sõlmitud töölepingu ${manner} üles töölepingu seaduse alusel (${legalBasis(data)}).`,
    ...(data.position ? [`Ametikoht: ${data.position}.`] : []),
    ...(data.contractDate ? [`Töölepingu sõlmimise kuupäev: ${dateText(data.contractDate)}.`] : []),
    `Minu viimane tööpäev ja töölepingu lõppemise kuupäev on ${dateText(data.lastDay)}.`,
    ...(data.terminationType === 'extraordinary' ? [`Ülesütlemise põhjus: ${data.reason}`] : []),
    `Avalduse kuupäev: ${dateText(data.documentDate)}`,
    `Avalduse esitaja: ${data.employeeName}`,
    'Allkiri: ______________________'
  ];
}
export function resignationFilename(data) {
  const name = data.employeeName.normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '').slice(0, 100);
  return `Lahkumisavaldus_${name}_${data.documentDate}.pdf`;
}
export function exampleData(today = tallinnToday()) {
  return { employeeName: 'Mari Näidis', position: 'Projektikoordinaator', contractType: 'indefinite', terminationType: 'ordinary', documentDate: today, lastDay: addDays(today, 30), employmentConfirmed: true, demonstration: true };
}
