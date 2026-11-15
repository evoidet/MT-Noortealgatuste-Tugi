import { request } from './api.js';
import { departureTypes, followUp, nextProgress, progressLabels, tallinnToday } from './resignation-values.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const call = (path = '', options = {}) => request('/resignations' + path, options);
const button = (action, label) => '<button type="button" data-resign="' + action + '">' + label + '</button>';
const input = (key, label, value, type = 'text', attributes = '') =>
  '<label>' + label + '<input name="' + key + '" type="' + type + '" value="' + esc(value) + '" ' + attributes + '></label>';
const checkbox = (key, label, value, attributes = '') =>
  '<label class="resignation-check"><input type="checkbox" name="' + key + '"' + (value ? ' checked' : '') + ' ' + attributes + '><span>' + label + '</span></label>';
const select = (key, label, value, choices, attributes = '') => '<label>' + label + '<select name="' + key + '" ' + attributes + '>' +
  '<option value="">Valige</option>' + Object.entries(choices).map(([key, label]) =>
    '<option value="' + key + '"' + (key === value ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></label>';
const textarea = (key, label, value, max = 2400) =>
  '<label>' + label + '<textarea name="' + key + '" maxlength="' + max + '">' + esc(value) + '</textarea></label>';

function mandateFields(action, org) {
  return '<p>Kontrollige lepingu tingimusi ja <a href="https://www.riigiteataja.ee/akt/120062026018#para630" target="_blank" rel="noopener">VÕS §-e 630–631</a>.</p>' +
    checkbox('actualAgreement', 'Kinnitan, et nimetatud käsundusleping on sõlmitud ja kehtib.', action.actualAgreement) +
    '<div class="financial-fields">' +
    input('contractDate', 'Lepingu kuupäev', action.contractDate, 'date') +
    input('contractNumber', 'Lepingu number (valikuline)', action.contractNumber, 'text', 'maxlength="100"') +
    select('party', 'Teie roll lepingupoolena', action.party, { provider: 'Käsundisaaja', client: 'Käsundiandja' }, 'data-conditional') +
    select('contractTerm', 'Lepingu kestus', action.contractTerm, { indefinite: 'Tähtajatu', fixed: 'Tähtajaline', long: 'Eluaegne või üle viie aasta' }, 'data-conditional') +
    select('termination', 'Ülesütlemise liik', action.termination, { ordinary: 'Korraline', extraordinary: 'Erakorraline' }, 'data-conditional') +
    input('receiptDate', 'Eeldatav teate kättesaamise kuupäev', action.receiptDate, 'date') +
    input('noticeDays', 'Kohaldatav etteteatamistähtaeg päevades (0, kui tähtaega pole)', action.noticeDays, 'number', 'min="0" max="3650"') +
    '</div><p>Teine lepingupool: <strong>' + esc(org.name) + '</strong></p>' +
    (action.termination === 'ordinary' && action.contractTerm && action.contractTerm !== 'indefinite'
      ? checkbox('ordinaryClause', 'Leping annab õiguse korraliseks ülesütlemiseks.', action.ordinaryClause) : '') +
    (action.termination === 'ordinary' && action.contractTerm === 'indefinite' && action.party === 'provider'
      ? checkbox('alternativePerformance', 'Kontrollisin, et käsundiandja saab teenuse või tehingu korraldada muul viisil (VÕS § 630 lg 2).', action.alternativePerformance) : '') +
    (action.termination === 'extraordinary' ? '<p>Kirjeldage põhjuses, miks lepingu jätkamist ei saa asjaolusid ja poolte huve arvestades eeldada.</p>' : '') +
    textarea('contractTerms', 'Kohaldatavad lõpetamis- ja teatamistingimused', action.contractTerms, 1800) +
    checkbox('termsReviewed', 'Kontrollisin lepingut, kohaldatavat õiguslikku alust ja etteteatamise tingimusi.', action.termsReviewed);
}

function actionFields(action, org) {
  return '<fieldset class="resignation-action" data-kind="' + action.kind + '"><legend>' + departureTypes[action.kind].label + '</legend>' +
    '<p>Õiguslik staatus: <strong>' + departureTypes[action.kind].status + '</strong></p><div class="financial-fields">' +
    input('role', 'Roll või ülesanded organisatsioonis' + (action.kind === 'volunteer' ? '' : ' (valikuline)'), action.role, 'text', 'list="departure-roles" maxlength="240"') +
    input('effectiveDate', 'Soovitud lõppkuupäev' + (action.kind === 'mandate' ? '' : ' (valikuline)'), action.effectiveDate, 'date') + '</div>' +
    (action.kind === 'board' ? '<div class="financial-fields">' +
      input('appointingBody', 'Määranud organ, kui see erineb üldkoosolekust', action.appointingBody, 'text', 'maxlength="180"') +
      input('boardCount', 'Juhatuse liikmete arv registri järgi koos teiega (valikuline)', action.boardCount, 'number', 'min="1" max="99"') +
      '</div><p>Põhikirja järgi valib juhatuse üldkoosolek. Kui teie määras teine organ, sisestage selle täpne nimetus.</p>' : '') +
    (action.kind === 'volunteer' ? checkbox('writtenAgreement', 'Vabatahtlik tegevus põhineb kirjalikul kokkuleppel.', action.writtenAgreement) +
      (action.writtenAgreement ? '<p>Kontrollige kokkuleppe lõpetamise tingimusi eraldi.</p>' : '') : '') +
    (action.kind === 'mandate' ? mandateFields(action, org) : '') +
    textarea('reason', action.kind === 'mandate' && action.termination === 'extraordinary' ? 'Põhjus' : 'Põhjus (valikuline)', action.reason) +
    textarea('explanation', 'Täiendav selgitus (valikuline)', action.explanation) + '</fieldset>';
}

let workspace;
export async function mountResignation(root, { user }) {
  if (workspace?.owner !== user.id) workspace = { owner: user.id, current: null };
  const section = document.createElement('section');
  section.className = 'staff-home financial resignation';
  root.replaceChildren(section);
  const { organization } = await call('/settings');
  let current = workspace.current;
  let busy = false;
  let review;
  function render(html) {
    workspace.current = current;
    section.innerHTML = '<h1>Lahkumisavaldus</h1><p role="alert" class="financial-error" hidden></p>' + html;
  }
  function report(error) {
    const box = section.querySelector('[role="alert"]');
    box.hidden = false;
    box.textContent = error.payload?.error ||
      ({ 401: 'Seanss on aegunud. Logige uuesti sisse.', 403: 'Teil puudub selleks toiminguks õigus.', 429: 'Liiga palju päringuid. Proovige hiljem.' })[error.status] ||
      (error instanceof TypeError || error.status ? 'Toiming ebaõnnestus. Proovige uuesti.' : error.message);
    box.scrollIntoView({ block: 'nearest' });
  }
  function collect() {
    const form = section.querySelector('form[data-departure]');
    if (!form) return;
    const read = name => form.querySelector('[name="' + name + '"]').value;
    const fields = [...form.querySelectorAll('[data-kind]')].map(group => {
      const entry = { kind: group.dataset.kind };
      for (const field of group.querySelectorAll('input,select,textarea')) {
        if (field.type === 'number') {
          if (field.value !== '') entry[field.name] = Number(field.value);
        } else entry[field.name] = field.type === 'checkbox' ? field.checked : field.value;
      }
      return entry;
    });
    current.data = { name: read('name'), email: read('email'), noticeDate: read('noticeDate'),
      actions: [...form.querySelectorAll('[data-choice]:checked')].map(choice =>
        fields.find(field => field.kind === choice.value) || { kind: choice.value }) };
  }
  async function list() {
    const { items } = await call();
    current = null;
    render(button('new', 'Loo uus avaldus') + '<h2>Minu avaldused</h2>' +
      (items.length ? '<ul>' + items.map(item => {
        const title = item.legacy ? 'Varasem avaldus' : item.data.actions.map(action => departureTypes[action.kind].label).join(' · ');
        const status = item.legacy ? 'Arhiiv' : item.workflow ? Object.values(item.workflow.progress).map(entry => progressLabels[entry.status]).join(' · ') : 'Mustand';
        return '<li><button type="button" data-resign="open" data-id="' + esc(item.id) + '">' + esc(title) + '</button> ' + esc(status) + '</li>';
      }).join('') + '</ul>' : '<p>Salvestatud avaldusi pole.</p>'));
  }
  function editor() {
    const data = current.data;
    render(button('list', '← Minu avaldused') +
      '<form data-departure><fieldset class="resignation-action"><legend>Millise suhte soovite lõpetada?</legend>' +
      Object.entries(departureTypes).map(([kind, type]) => checkbox('choice', '<strong>' + type.label + '</strong><br>' + type.description,
        data.actions.some(action => action.kind === kind), 'data-choice value="' + kind + '"')).join('') + '</fieldset>' +
      '<h2>Avaldaja andmed</h2><div class="financial-fields">' +
      input('name', 'Ees- ja perekonnanimi', data.name, 'text', 'maxlength="160"') +
      input('email', 'E-posti aadress', data.email, 'email', 'maxlength="254"') +
      input('noticeDate', 'Avalduse kuupäev', data.noticeDate, 'date') + '</div>' +
      '<datalist id="departure-roles">' + ['Tegevjuht', 'Finantsjuht', 'Kommunikatsioonijuht', 'Turundusjuht', 'Projektijuht', 'Raamatupidaja', 'Projektimeeskonna liige', 'Muu']
        .map(role => '<option value="' + role + '">').join('') + '</datalist>' +
      data.actions.map(action => actionFields(action, organization)).join('') +
      '<div class="financial-toolbar">' + button('save', 'Salvesta mustand') + button('review', 'Vaata avaldused üle') + '</div></form>');
  }
  async function save() {
    collect();
    if (!current.data.actions.length) throw new Error('Valige vähemalt üks avalduse liik.');
    const saved = await call(current.id ? '/' + current.id : '', {
      method: current.id ? 'PATCH' : 'POST',
      json: current.id ? { revision: current.revision, data: current.data } : { id: current.key, data: current.data },
    });
    current = saved.item;
    workspace.current = current;
  }
  function notes(lines) {
    return lines.length ? '<ul>' + lines.map(line => '<li>' + esc(line) + '</li>').join('') + '</ul>' : '';
  }
  async function reviewScreen() {
    await save();
    review = await call('/' + current.id + '/preview', { method: 'POST', json: { revision: current.revision } });
    render(button('edit', '← Muuda andmeid') + '<h2 tabindex="-1" data-review-title>Kinnita valitud avaldused</h2>' +
      '<p>Iga valitud suhte kohta koostatakse eraldi allkirjastamata dokument.</p>' +
      review.documents.map(doc => '<article class="resignation-paper"><p>' + esc(['Saaja: ' + doc.recipient, ...doc.address, '', ...doc.applicant].join('\n')) +
        '</p><h3>' + esc(doc.title) + '</h3>' + [...doc.paragraphs, doc.signature].map(line => '<p>' + esc(line) + '</p>').join('') + '</article>' + notes(doc.followUp)).join('') +
      checkbox('confirm', 'Kinnitan valitud suhted, saajad ja avalduste sisu.', false) + button('prepare', 'Koosta avaldused'));
    section.querySelector('[data-review-title]').focus();
  }
  function results() {
    const base = '/api/staff/resignations/' + current.id;
    render(button('list', '← Minu avaldused') + '<h2>Koostatud avaldused</h2><p>Laadige avaldused alla, allkirjastage ja edastage need saajatele. Siin saate märkida väljaspool süsteemi tehtud toimingud.</p>' +
      current.data.actions.map(action => {
        const status = current.workflow.progress[action.kind].status;
        const next = nextProgress[status];
        return '<section class="resignation-action"><h3>' + departureTypes[action.kind].label + '</h3><p>' + progressLabels[status] + '</p>' +
          notes(followUp(action)) + '<div class="financial-toolbar">' +
          ['pdf', 'docx'].map(format => '<a class="staff-button staff-button--secondary" href="' + base + '/documents/' + action.kind + '/' + format +
            '?revision=' + current.revision + '">Laadi ' + format.toUpperCase() + ' alla</a>').join('') +
          (next ? '<button type="button" data-resign="progress" data-kind="' + action.kind + '" data-status="' + next + '">Märgi: ' + progressLabels[next] + '</button>' : '') + '</div></section>';
      }).join(''));
  }
  function open() {
    if (current.legacy) {
      render(button('list', '← Minu avaldused') + '<h2>Varasem avaldus</h2><p>Kirje on arhiivis.</p>' +
        (current.legacyPdf ? '<a href="/api/staff/resignations/' + current.id + '/pdf">Laadi arhiveeritud PDF alla</a>' : ''));
    } else if (current.workflow) results();
    else editor();
  }
  section.addEventListener('submit', event => event.preventDefault());
  section.addEventListener('input', event => {
    if (!event.target.closest('form[data-departure]')) return;
    collect();
  });
  section.addEventListener('change', event => {
    const target = event.target;
    if (!target.matches('[data-choice], [data-conditional], [name="writtenAgreement"]')) return;
    collect();
    const kind = target.closest('[data-kind]')?.dataset.kind;
    const selector = target.matches('[data-choice]') ? '[data-choice][value="' + target.value + '"]'
      : '[data-kind="' + kind + '"] [name="' + target.name + '"]';
    editor();
    section.querySelector(selector)?.focus();
  });
  section.addEventListener('click', async event => {
    const target = event.target.closest('[data-resign]');
    if (!target || busy) return;
    busy = true;
    target.disabled = true;
    try {
      switch (target.dataset.resign) {
        case 'new':
          current = { key: crypto.randomUUID(), data: { name: user.name || '', email: user.email || '', noticeDate: tallinnToday(), actions: [] } };
          editor();
          break;
        case 'list': await list(); break;
        case 'open': current = (await call('/' + target.dataset.id)).item; open(); break;
        case 'edit': editor(); break;
        case 'save': await save(); editor(); break;
        case 'review': await reviewScreen(); break;
        case 'prepare':
          if (!section.querySelector('[name="confirm"]').checked) throw new Error('Kinnitage valitud suhted ja avalduste sisu.');
          current = (await call('/' + current.id + '/prepare', { method: 'POST', json: { confirm: true, revision: review.revision } })).item;
          results();
          break;
        case 'progress':
          if (!window.confirm('Kinnitage tehtud toiming: ' + progressLabels[target.dataset.status])) break;
          current = (await call('/' + current.id + '/progress', { method: 'POST', json: {
            confirm: true, revision: current.revision, kind: target.dataset.kind, status: target.dataset.status,
          } })).item;
          results();
          break;
      }
    } catch (error) { report(error); }
    finally { busy = false; if (target.isConnected) target.disabled = false; }
  });
  if (current) open();
  else await list();
}
