import { request } from './api.js';
import { terminationLabels, tallinnToday, noticeInfo, dateText, exampleData, documentParagraphs } from './resignation-values.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const call = (path = '', options = {}) => request(`/resignations${path}`, options);
const statuses = { DRAFT: 'Mustand', SENDING: 'Saatmine / tulemus vajab kontrolli', SENT: 'Saadetud', SEND_FAILED: 'Saatmine ebaõnnestus', UNCERTAIN: 'Saatmise tulemus vajab kontrolli' };
// Keep unsaved input during in-app navigation, never in public browser storage.
let workspace;
export async function mountResignation(root, { user }) {
  if (workspace?.owner !== user.id) workspace = { owner: user.id, current: null };
  const section = document.createElement('section');
  section.className = 'staff-home financial resignation';
  root.replaceChildren(section);
  const settings = await call('/settings');
  let current = workspace.current, busy = false, reviewedRevision = null;
  const button = (action, label) => `<button type="button" data-resign="${action}">${label}</button>`;
  const render = html => { section.innerHTML = `<h1>Lahkumisavaldus</h1><p role="alert" class="financial-error" hidden></p>${html}`; };
  const error = e => {
    const box = section.querySelector('[role="alert"]');
    box.hidden = false;
    box.textContent = e.payload?.issues?.map(i => i.message).join(' ') ||
      ({ 401: 'Seanss on aegunud. Logige uuesti sisse.', 403: 'Teil puudub selleks õigus.', 429: 'Liiga palju päringuid. Proovige hiljem.' })[e.status] ||
      (e.payload?.error && !/^[A-Z_]+$/.test(e.payload.error) ? e.payload.error : 'Toiming ebaõnnestus. Sisestatud andmed on alles. Proovige uuesti.');
    box.scrollIntoView({ block: 'nearest' });
    for (const issue of e.payload?.issues || []) {
      const field = section.querySelector(`[name="${CSS.escape(issue.field)}"]`);
      if (!field) continue;
      field.setAttribute('aria-invalid', 'true');
      const help = document.createElement('small');
      help.className = 'resignation-field-error'; help.textContent = issue.message;
      field.closest('label')?.append(help);
    }
  };
  function remember() { workspace.current = current; }
  function blank() { return { id: crypto.randomUUID(), revision: null, status: 'DRAFT', data: { employeeName: user.name || '', email: user.email || '', contractType: 'indefinite', terminationType: 'ordinary', documentDate: tallinnToday(), demonstration: false } }; }
  function collect() {
    const form = section.querySelector('form[data-resignation]');
    if (!form || current.status !== 'DRAFT') return;
    for (const input of form.querySelectorAll('[name]')) current.data[input.name] = input.type === 'checkbox' ? input.checked : input.value;
    reviewedRevision = null;
    remember();
  }
  async function save() {
    collect();
    const result = current.revision === null ? await call('', { method: 'POST', json: { id: current.id, data: current.data } })
      : await call(`/${current.id}`, { method: 'PATCH', json: { revision: current.revision, data: current.data } });
    current = result.item; remember();
    return current;
  }
  async function list() {
    const { items } = await call();
    render(`<p>Koostage töölepingu ülesütlemise avaldus. MTÜ liikmesuse, juhatuse liikme lepingu või teenuslepingu lõpetamiseks kasutage teist dokumenti.</p>
      <div class="financial-toolbar">${button('new', 'Loo uus avaldus')}${workspace.current ? button('resume', 'Jätka oma avaldust') : ''}</div>
      <div class="financial-table"><table><thead><tr><th>Töötaja</th><th>Kuupäev</th><th>Staatus</th><th></th></tr></thead><tbody>
      ${items.map(d => `<tr><td>${esc(d.data.employeeName || 'Nimeta mustand')}${d.data.demonstration ? ' (näidis)' : ''}</td><td>${dateText(d.data.documentDate)}</td><td>${statuses[d.status] || esc(d.status)}</td><td><button type="button" data-resign="open" data-id="${esc(d.id)}">Ava</button></td></tr>`).join('') || '<tr><td colspan="4">Avaldusi ei ole.</td></tr>'}</tbody></table></div>`);
  }
  function editor() {
    remember(); reviewedRevision = null;
    const d = current.data;
    const input = (name, label, type = 'text', required = false) => `<label>${label}${required ? ' *' : ''}<input name="${name}" type="${type}" value="${esc(d[name])}" ${required ? 'required' : ''} maxlength="${name === 'employeeName' || name === 'position' ? 200 : 254}"></label>`;
    const check = (name, label) => `<label class="resignation-check"><input type="checkbox" name="${name}" ${d[name] ? 'checked' : ''}>${label}</label>`;
    const select = (name, label, options) => `<label>${label}<select name="${name}">${Object.entries(options).map(([v, l]) => `<option value="${v}" ${d[name] === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
    render(`${button('list', '← Minu avaldused')}<p>Saaja: <strong>${esc(settings.recipient)}</strong>. Staatus: ${statuses[current.status]}${d.demonstration ? ' · NÄIDIS – EI OLE ESITAMISEKS' : ''}</p>
      <p>${esc(settings.submissionExplanation)}</p>
      ${current.delivery ? `<p>Esitamise aeg: ${esc(new Intl.DateTimeFormat('et-EE', { timeZone: 'Europe/Tallinn', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(current.delivery.confirmedAt)))}. Kirja saatmisele vastuvõtmine ei tõenda tööandja kättesaamist.</p>` : ''}
      <form data-resignation><fieldset ${current.status !== 'DRAFT' ? 'disabled' : ''}><legend>Töötaja andmed</legend>
      <div class="financial-fields">${input('employeeName', 'Ees- ja perekonnanimi', 'text', true)}${input('position', 'Ametikoht (valikuline)')}${input('contractDate', 'Töölepingu sõlmimise kuupäev (valikuline)', 'date')}${input('email', 'E-posti aadress (valikuline)', 'email')}
      ${select('contractType', 'Töölepingu liik', { indefinite: 'Tähtajatu tööleping', fixed: 'Tähtajaline tööleping' })}</div>
      <div data-fixed ${d.contractType !== 'fixed' ? 'hidden' : ''}>${check('replacement', 'Leping on sõlmitud äraoleva töötaja asendamise ajaks.')}</div>
      ${check('employmentConfirmed', 'Kinnitan, et avaldus puudutab töölepingut, mitte MTÜ liikmesust, juhatuse liikme ega teenuslepingut.')}</fieldset>
      <fieldset ${current.status !== 'DRAFT' ? 'disabled' : ''}><legend>Töölepingu ülesütlemise andmed</legend>
      ${select('terminationType', 'Ülesütlemise liik', terminationLabels)}
      <p data-type-help></p><div class="financial-fields">${input('documentDate', 'Avalduse koostamise kuupäev', 'date', true)}${input('lastDay', 'Soovitud viimane tööpäev', 'date', true)}${input('submissionDate', 'Avalduse tegelik esitamise kuupäev (kui teada)', 'date')}${input('receiptDate', 'Tööandja tegelik kättesaamise kuupäev (kui teada)', 'date')}</div>
      <p>PDF-i loomine ega kirja saatmisele vastuvõtmine ei tõenda kättesaamist. Kuupäevad esitatakse kujul pp.kk.aaaa.</p>
      <div data-probation ${d.terminationType !== 'probation' ? 'hidden' : ''}><div class="financial-fields">${input('probationStart', 'Katseaja tegelik algus', 'date')}${input('probationEnd', 'Katseaja tegelik lõpp', 'date')}</div>
      ${check('probationConfirmed', 'Kontrollisin töölepingu kokkuleppeid ja katseaja peatumisi ning kinnitan, et tööandja saab avalduse katseaja jooksul. Hiljutine tööle asumine üksi ei tõenda katseaega.')}</div>
      <div data-extraordinary ${d.terminationType !== 'extraordinary' ? 'hidden' : ''}><label>Ülesütlemise põhjus *<textarea name="reason" rows="6" maxlength="8000">${esc(d.reason)}</textarea></label>
      <p>Kirjeldage ainult tegelikke asjaolusid. AI-le saadetakse üksnes see tekst; eemaldage isikukoodid ja ebavajalikud isikuandmed.</p>
      ${button('ai', 'Kontrolli teksti tehisintellektiga')}
      ${check('extraordinaryAcknowledged', 'Mõistan, et süsteem ei tuvasta mõjuva põhjuse olemasolu ega õigust etteteatamata üles öelda (TLS § 91 ja § 98 lg 2). Vajadusel küsin õigusnõu.')}</div>
      <p data-notice aria-live="polite"></p><div data-short>${check('shortNoticeAcknowledged', 'Mõistan lühema etteteatamise võimalikke tagajärgi, sealhulgas hüvitise või kahju nõude võimalust.')}</div></fieldset>
      <div class="financial-toolbar">${current.status === 'DRAFT' ? `${button('save', 'Salvesta mustand')}${button('preview', 'Eelvaade')}` : button('preview', 'Eelvaade')}${button('download', 'Laadi PDF alla')}${button('example', 'Vaata näidist')}${current.status === 'DRAFT' ? button('fill-example', 'Täida näidisandmetega') : ''}${button('prepare-submit', 'Esita avaldus juhatusele')}</div>
      </form><div data-review></div><div data-example></div><div data-ai></div><div data-confirm></div>
      <p>Õiguslikud allikad: <a href="https://www.riigiteataja.ee/et/akt/TLS" target="_blank" rel="noopener">Töölepingu seadus</a> · <a href="https://www.tooelu.ee/et/31/toolepingu-uhepoolne-lopetamine" target="_blank" rel="noopener">Tööelu</a></p>`);
    dynamic();
  }
  function dynamic() {
    const d = current.data, n = noticeInfo(d);
    section.querySelector('[data-fixed]').hidden = d.contractType !== 'fixed';
    section.querySelector('[data-probation]').hidden = d.terminationType !== 'probation';
    section.querySelector('[data-extraordinary]').hidden = d.terminationType !== 'extraordinary';
    section.querySelector('[data-short]').hidden = !n.short;
    section.querySelector('[data-notice]').textContent = n.days === null ? 'Erakorralise ülesütlemise etteteatamata jätmine sõltub TLS § 98 lg 2 tingimustest; süsteem ei anna automaatset õiguslikku hinnangut.'
      : `${n.estimated ? 'Hinnanguline arvutus (kättesaamine ei ole teada)' : 'Arvutus kättesaamise alusel'}: ${dateText(n.base)} + ${n.days} kalendripäeva = ${dateText(n.earliest)}. Tähtaeg algab kättesaamisele järgnevast päevast.${n.short ? ' Valitud etteteatamine on lühem. See ei muuda avaldust automaatselt tühiseks, kuid võib tuua kaasa nõude.' : ''}`;
    section.querySelector('[data-type-help]').textContent = d.terminationType === 'ordinary' ? 'Üldjuhul tuleb ette teatada 30 kalendripäeva. Põhjust ei pea selgitama. Tähtajalise lepingu puhul kehtib asendaja erand.' : d.terminationType === 'probation' ? 'Kehtiva katseaja jooksul võib nii tähtajalise kui ka tähtajatu töölepingu üles öelda 15-kalendripäevase etteteatamisega.' : 'Erakorraliseks ülesütlemiseks peab olema mõjuv põhjus. Töötaja peab ülesütlemist põhjendama.';
  }
  async function preview() {
    if (current.status === 'DRAFT') await save();
    const result = await call(`/${current.id}/preview`, { method: 'POST', json: { revision: current.revision } });
    reviewedRevision = result.revision;
    const employer = current.delivery?.employer || settings.employer;
    section.querySelector('[data-review]').innerHTML = `<h2>Eelvaade</h2><article class="resignation-paper" aria-label="Avalduse eelvaade">
      ${current.data.demonstration ? '<p><strong>NÄIDIS – EI OLE ESITAMISEKS</strong></p>' : ''}
      <p>${esc(employer.name)} juhatusele<br><small>Registrikood: ${esc(employer.registrationCode)}<br>${esc(employer.address)}</small></p>
      <h3>TÖÖLEPINGU ÜLESÜTLEMISE AVALDUS</h3>${documentParagraphs(current.data, employer).map(p => `<p>${esc(p)}</p>`).join('')}</article>
      <details><summary>Vaata PDF-i eelvaadet</summary><iframe title="Lahkumisavalduse PDF-i eelvaade" class="resignation-pdf" src="${esc(result.pdfUrl)}#toolbar=0"></iframe></details>
      <p>Eelvaade ei esita ega saada avaldust. Kui brauser ei kuva PDF-i, kasutage nuppu „Laadi PDF alla”.</p>`;
  }
  section.addEventListener('submit', event => event.preventDefault());
  section.addEventListener('input', event => {
    if (!event.target.closest('form[data-resignation]')) return;
    event.target.removeAttribute('aria-invalid');
    event.target.closest('label')?.querySelectorAll('.resignation-field-error').forEach(e => e.remove());
    collect(); dynamic(); section.querySelector('[data-confirm]').replaceChildren(); section.querySelector('[data-review]').replaceChildren();
  });
  section.addEventListener('click', async event => {
    const target = event.target.closest('[data-resign]');
    if (!target || busy) return;
    busy = true; target.disabled = true;
    try {
      const action = target.dataset.resign;
      if (action === 'new') { if (workspace.current) { render(`<p>Uue avalduse avamisel jäävad alles ainult salvestatud muudatused. Kas jätkata?</p>${button('confirm-new', 'Ava uus avaldus')}${button('resume', 'Tagasi oma avaldusele')}`); } else { current = blank(); editor(); } }
      if (action === 'confirm-new') { current = blank(); editor(); }
      if (action === 'resume') { current = workspace.current; editor(); }
      if (action === 'list') { collect(); await list(); }
      if (action === 'open') { current = (await call(`/${target.dataset.id}`)).item; editor(); }
      if (action === 'save') { await save(); editor(); }
      if (action === 'preview') await preview();
      if (action === 'download') { await preview(); const a = document.createElement('a'); a.href = `/api/staff/resignations/${current.id}/pdf?download=1&revision=${reviewedRevision}`; a.click(); }
      if (action === 'example') {
        section.querySelector('[data-example]').innerHTML = `<aside class="resignation-example"><h2>NÄIDIS – EI OLE ESITAMISEKS</h2><p>${esc(settings.employer.name)} juhatusele</p><h3>TÖÖLEPINGU ÜLESÜTLEMISE AVALDUS</h3>${documentParagraphs(exampleData(), settings.employer).map(p => `<p>${esc(p)}</p>`).join('')}${button('close-example', 'Tagasi oma avaldusele')}</aside>`;
      }
      if (action === 'close-example') section.querySelector('[data-example]').replaceChildren();
      if (action === 'fill-example') section.querySelector('[data-example]').innerHTML = `<p>Näidisandmed asendavad praeguse sisestuse. Näidisdokumenti ei saa esitada. Oma avalduse jaoks looge uus mustand.</p>${button('confirm-example', 'Kinnitan andmete asendamise')}${button('close-example', 'Tühista')}`;
      if (action === 'confirm-example') { current.data = exampleData(); editor(); }
      if (action === 'ai') {
        collect(); const original = current.data.reason || '';
        if (!original.trim()) throw new Error('empty');
        const { suggestion } = await request('/ai/improve', { method: 'POST', json: { text: original, field: 'resignation.reason', language: 'et', mode: 'fix_language' } });
        section.querySelector('[data-ai]').innerHTML = `<h2>Keeleparanduse ettepanek</h2><h3>Algne tekst</h3><p class="resignation-prose">${esc(original)}</p><h3>Parandatud tekst</h3><p class="resignation-prose">${esc(suggestion)}</p><p>Kontrollige, et kõik asjaolud, nimed, eitused ja põhjused jäid samaks. AI ei kinnita õiguslikku kehtivust.</p>${button('apply-ai', 'Rakenda parandused')}${button('dismiss-ai', 'Jäta algne tekst')}`;
        section.querySelector('[data-ai]')._suggestion = { original, suggestion };
      }
      if (action === 'apply-ai') { const change = section.querySelector('[data-ai]')._suggestion; collect(); if (current.data.reason !== change.original) throw new Error('stale'); current.data.reason = change.suggestion; editor(); }
      if (action === 'dismiss-ai') section.querySelector('[data-ai]').replaceChildren();
      if (action === 'prepare-submit') {
        await preview();
        section.querySelector('[data-confirm]').innerHTML = `<p>Saaja: <strong>${esc(settings.recipient)}</strong>. Esitamine saadab ametliku töölepingu ülesütlemise tahteavalduse.</p><p>${esc(settings.submissionExplanation)}</p>${settings.submissionSupported ? `<label><input type="checkbox" data-submit-confirm>Kinnitan, et olen avalduse esitaja, vaatasin lõpliku PDF-i üle ja soovin avalduse esitada.</label>${button('submit', 'Kinnitan ja saadan avalduse')}` : ''}`;
      }
      if (action === 'submit' && section.querySelector('[data-submit-confirm]')?.checked && reviewedRevision === current.revision) {
        const result = await call(`/${current.id}/submit`, { method: 'POST', json: { confirm: true, revision: reviewedRevision } }); current = result.item; editor();
      }
    } catch (e) { error(e); } finally { busy = false; if (target.isConnected) target.disabled = false; }
  });
  if (current) editor(); else await list();
}
