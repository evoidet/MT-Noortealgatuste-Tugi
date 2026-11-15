export const departureTypes = {
  board: { label: 'Juhatuse liikme tagasiastumine', description: 'Juhatuse liikme kohalt tagasiastumise avaldus.', title: 'JUHATUSE LIIKME TAGASIASTUMISAVALDUS', status: 'Juhatuse liige', filename: 'juhatuse-liikme-tagasiastumisavaldus' },
  member: { label: 'MTÜ liikme väljaastumine', description: 'Mittetulundusühingu liikmeskonnast väljaastumise avaldus.', title: 'MTÜ LIIKME VÄLJAASTUMISAVALDUS', status: 'MTÜ liige', filename: 'mtu-liikme-valjaastumisavaldus' },
  volunteer: { label: 'Vabatahtliku tegevuse lõpetamine', description: 'Vabatahtliku tegevuse lõpetamise teade.', title: 'VABATAHTLIKU TEGEVUSE LÕPETAMISE TEADE', status: 'Vabatahtlik', filename: 'vabatahtliku-tegevuse-lopetamise-teade' },
  mandate: { label: 'Käsunduslepingu lõpetamine', description: 'Käsunduslepingu ülesütlemise avaldus olemasoleva lepingu kohta.', title: 'KÄSUNDUSLEPINGU ÜLESÜTLEMISE AVALDUS', status: 'Käsunduslepingu alusel tegutsev isik', filename: 'kasunduslepingu-ulesutlemise-avaldus' },
};

export const boardMinimum = 3;
export const progressLabels = { prepared: 'Avaldus koostatud', sent: 'Avaldus edastatud', received: 'Avaldus kätte saadud', completed: 'Menetlus lõpetatud' };
export const nextProgress = { prepared: 'sent', sent: 'received', received: 'completed' };

export const tallinnToday = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Tallinn' }).format(new Date());
export const dateText = value => value ? value.split('-').reverse().join('.') : '';
export const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  new Date(value).toJSON()?.slice(0, 10) === value;
export function addDays(value, days) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function addMonths(value, months) {
  const date = new Date(value);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const end = new Date(date);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  date.setUTCDate(Math.min(day, end.getUTCDate()));
  return date.toISOString().slice(0, 10);
}

export function followUp(action) {
  if (action.kind === 'board') return [
    'Pärast teate kättesaamist kontrollige juhatuse andmeid e-äriregistris ja korraldage vajaduse korral kande muutmine.',
    action.boardCount == null ? 'Kontrollige juhatuse koosseisu. Põhikirja § 4 lg 1 järgi on juhatuses 3–7 liiget.'
      : action.boardCount - 1 < boardMinimum ? 'Sisestatud andmete põhjal jääks juhatusse alla kolme liikme. Korraldage vajaduse korral asendusliikme valimine.' : '',
  ].filter(Boolean);
  if (action.kind === 'member') return ['Pärast väljaastumise jõustumist uuendage liikmete nimekirja.'];
  if (action.kind === 'volunteer' && action.writtenAgreement) return ['Kontrollige kirjaliku vabatahtliku tegevuse kokkuleppe lõpetamise tingimusi eraldi.'];
  if (action.kind === 'mandate') return ['Kontrollige lepingu lõppemisega seotud üleandmise, aruandluse ja arvelduse kohustusi.'];
  return [];
}

export function departureDocument(data, action, organization) {
  const type = departureTypes[action.kind];
  const recipient = action.kind === 'board' ? action.appointingBody || 'Üldkoosolek' : 'Juhatus';
  const paragraphs = [];
  const effective = dateText(action.effectiveDate);
  switch (action.kind) {
    case 'board':
      paragraphs.push('Teatan, et astun tagasi ' + organization.name + ' juhatuse liikme kohalt.');
      if (effective) paragraphs.push('Soovin, et minu volitused lõpeksid ' + effective + '.');
      break;
    case 'member':
      paragraphs.push('Teatan, et astun omal soovil ' + organization.name + ' liikmeskonnast välja.');
      if (effective) paragraphs.push('Soovitud liikmesuse lõppemise kuupäev on ' + effective + '.');
      break;
    case 'volunteer':
      paragraphs.push('Teatan, et lõpetan vabatahtliku tegevuse organisatsioonis ' + organization.name + '.');
      if (effective) paragraphs.push('Soovitud tegevuse lõppemise kuupäev on ' + effective + '.');
      break;
    case 'mandate':
      paragraphs.push('Ütlen ' + (action.termination === 'extraordinary' ? 'erakorraliselt' : 'korraliselt') +
        ' üles ' + dateText(action.contractDate) + ' sõlmitud käsunduslepingu' +
        (action.contractNumber ? ' nr ' + action.contractNumber : '') + '.');
      paragraphs.push('Lepingupooled: ' + (action.party === 'provider' ? 'käsundisaaja ' + data.name + ' ja käsundiandja ' + organization.name
        : 'käsundiandja ' + data.name + ' ja käsundisaaja ' + organization.name) + '.');
      paragraphs.push('Soovitud lepingu lõppemise kuupäev: ' + effective + '.');
      paragraphs.push('Lepingu ülesütlemise tingimused: ' + action.contractTerms);
      break;
  }
  if (action.reason) paragraphs.push('Põhjus: ' + action.reason);
  if (action.explanation) paragraphs.push('Täiendav selgitus: ' + action.explanation);
  return {
    title: type.title,
    recipient,
    address: [organization.name, 'Registrikood: ' + organization.registrationCode, organization.address],
    applicant: [
      'Avalduse esitaja: ' + data.name, 'E-post: ' + data.email, 'Õiguslik staatus: ' + type.status,
      action.role && 'Roll või ülesanded organisatsioonis: ' + action.role,
      'Avalduse kuupäev: ' + dateText(data.noticeDate),
    ].filter(Boolean),
    paragraphs,
    signature: 'Allkiri: ______________________________',
    filename: type.filename + '-' + data.noticeDate,
  };
}
