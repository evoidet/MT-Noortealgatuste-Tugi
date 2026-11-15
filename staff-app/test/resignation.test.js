import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { openDatabase } from '../src/database.js';
import { loadMigrations } from '../scripts/db-migrate.mjs';
import { resignationRoutes } from '../src/resignation-routes.js';
import { validateResignation } from '../src/resignation-validation.js';
import { addDays, noticeInfo, legalBasis, documentParagraphs, tallinnToday, resignationFilename } from '../public/resignation-values.js';
import { canReadSubmission, canEditSubmission } from '../src/permissions.js';
import { createMailService } from '../src/mail.js';
import { createAiAssistant } from '../src/ai.js';
import { organization } from '../src/organization.js';

const today = tallinnToday();
const ordinary = (overrides = {}) => ({ employeeName: 'Õie Ööäär', documentDate: today,
  lastDay: addDays(today, 30), employmentConfirmed: true, ...overrides });
const final = data => validateResignation(data, { final: true });

test('calendar notice periods: specification examples, leap years, months, weekends and Tallinn midnight', () => {
  assert.equal(noticeInfo({ terminationType: 'ordinary', receiptDate: '2026-11-10' }).earliest, '2026-12-10');
  assert.equal(noticeInfo({ terminationType: 'probation', receiptDate: '2026-11-10' }).earliest, '2026-11-25');
  for (const [start, days, end] of [['2028-02-14', 15, '2028-02-29'], ['2027-02-14', 15, '2027-03-01'], ['2026-12-20', 30, '2027-01-19'], ['2026-10-31', 15, '2026-11-15'], ['2026-12-10', 15, '2026-12-25']]) assert.equal(addDays(start, days), end);
  assert.equal(addDays('2026-02-29', 15), '');
  assert.equal(tallinnToday(new Date('2026-11-09T22:30:00Z')), '2026-11-10');
  assert.equal(noticeInfo({ terminationType: 'ordinary', documentDate: '2020-01-01' }, '2026-11-10').base, '2026-11-10');
  assert.equal(noticeInfo({ terminationType: 'ordinary' }).estimated, true);
});

test('legal validation handles fixed terms, probation, extraordinary grounds, short notice and placeholders', () => {
  assert.equal(legalBasis(final(ordinary())), 'TLS § 85 lg 1');
  assert.throws(() => final(ordinary({ contractType: 'fixed' })), /Kontrollige/);
  assert.equal(legalBasis(final(ordinary({ contractType: 'fixed', replacement: true }))), 'TLS § 85 lg 2');
  assert.throws(() => final(ordinary({ terminationType: 'probation' })));
  assert.equal(legalBasis(final(ordinary({ terminationType: 'probation', probationStart: today, probationEnd: addDays(today, 1), probationConfirmed: true }))), 'TLS § 86 lg 1');
  assert.throws(() => final(ordinary({ terminationType: 'probation', probationStart: today, probationEnd: addDays(today, -1), probationConfirmed: true })));
  assert.throws(() => final(ordinary({ terminationType: 'extraordinary', extraordinaryAcknowledged: true })));
  const extra = final(ordinary({ terminationType: 'extraordinary', reason: 'Töötasu on maksmata.', extraordinaryAcknowledged: true }));
  assert.match(documentParagraphs(extra, organization).join('\n'), /Töötasu on maksmata/);
  assert.throws(() => final(ordinary({ lastDay: today })));
  assert.doesNotThrow(() => final(ordinary({ lastDay: today, shortNoticeAcknowledged: true })));
  for (const input of [ordinary({ employeeName: '' }), ordinary({ lastDay: '' }), ordinary({ lastDay: addDays(today, -1) }), ordinary({ receiptDate: addDays(today, 1) }), ordinary({ terminationType: 'extraordinary', reason: '[põhjus]', extraordinaryAcknowledged: true }), ordinary({ employeeName: 'Nimi Perekonnanimi' }), ordinary({ employmentConfirmed: false })]) assert.throws(() => final(input));
  assert.throws(() => validateResignation(ordinary({ demonstration: true }), { final: true, submitting: true }));
  assert.throws(() => validateResignation({ ...ordinary(), _delivery: {} }));
  assert.doesNotMatch(resignationFilename({ employeeName: '../Õie \\ Ööäär', documentDate: today }), /[/\\]/);
});

async function fixture(t, { verified = false, outcome = 'accepted' } = {}) {
  const engine = new PGlite(); t.after(() => engine.close());
  for (const migration of await loadMigrations()) await engine.exec(migration.sql);
  const client = { query: (sql, params) => engine.query(sql, params), release() {} };
  const database = openDatabase(null, { pool: { query: client.query, async connect() { return client; }, async end() {} } });
  const user = await database.upsertUser({ googleSubject: 'synthetic-resignation', email: 'synthetic@example.test', name: 'Õie Ööäär', role: 'member' });
  // PGlite's single connection cannot hold a pooled advisory lock while another
  // connection commits. Real row claims below still exercise the SQL contract.
  let locked = false;
  database.withSubmissionLock = async (_id, work) => {
    if (locked) throw Object.assign(new Error('Toiming on pooleli.'), { status: 409 });
    locked = true; try { return await work(); } finally { locked = false; }
  };
  let sends = 0;
  const mailService = { available: true, async sendResignation(args) {
    sends++; assert.equal(args.verifiedEmail, user.email); assert.equal(args.pdf.toString(), '%PDF-synthetic');
    if (outcome === 'timeout') throw new Error('private provider error');
    if (outcome === 'rejected') return { accepted: [], rejected: [organization.email] };
    return { accepted: [organization.email], messageId: 'synthetic-message' };
  } };
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { if (req.get('Actor') === 'none') return res.sendStatus(401); req.user = req.get('Actor') === 'other' ? { ...user, id: 'other', role: 'admin' } : user; next(); });
  app.use('/resignations', resignationRoutes({ database, mailService,
    auth: { verifyCsrf(req, res, next) { return req.get('X-CSRF-Token') === 'synthetic' ? next() : res.sendStatus(403); } },
    limiter: (_req, _res, next) => next(),
    verifyEmployee: async () => verified ? { userId: user.id, employeeName: user.name, email: user.email, employmentVerified: true, authorizationVerified: true } : null,
    pdfGenerator: async () => Buffer.from('%PDF-synthetic') }));
  const draft = await database.createSubmission({ type: 'resignation', creatorId: user.id, data: final(ordinary()) });
  return { app, database, draft, user, sends: () => sends };
}
const post = (app, path, body) => request(app).post(path).set('X-CSRF-Token', 'synthetic').send(body);

test('private unified drafts require CSRF, preserve revisions, and never send during preview/download', async t => {
  const { app, database, draft, user, sends } = await fixture(t);
  await request(app).get(`/resignations/${draft.id}`).set('Actor', 'none').expect(401);
  await request(app).get(`/resignations/${draft.id}`).set('Actor', 'other').expect(404);
  await request(app).get(`/resignations/${draft.id}/pdf`).set('Actor', 'other').expect(404);
  await request(app).post(`/resignations/${draft.id}/submit`).send({ confirm: true, revision: 1 }).expect(403);
  await post(app, `/resignations/${draft.id}/preview`, { revision: 0 }).expect(409);
  await post(app, `/resignations/${draft.id}/preview`, { revision: 1 }).expect(200);
  await request(app).get(`/resignations/${draft.id}/pdf?revision=0`).expect(409);
  const pdf = await request(app).get(`/resignations/${draft.id}/pdf`).expect(200);
  assert.equal(pdf.headers['x-frame-options'], 'SAMEORIGIN');
  assert.match(pdf.headers['cache-control'], /private, no-store/);
  await post(app, `/resignations/${draft.id}/submit`, { confirm: true, revision: 1 }).expect(409);
  assert.equal(sends(), 0);
  assert.equal((await database.getSubmission(draft.id)).status, 'DRAFT');
  assert.equal(canReadSubmission({ id: 'another', role: 'admin' }, draft), false);
  assert.equal(canReadSubmission(user, draft), true);
  assert.equal(canEditSubmission(user, draft), false);
  const id = '707451c2-008a-4aa3-9d66-11f5eea54911';
  await post(app, '/resignations', { id, data: { demonstration: true } }).expect(201);
  await post(app, '/resignations', { id, data: {} }).expect(201);
  const saved = await request(app).patch(`/resignations/${id}`).set('X-CSRF-Token', 'synthetic').send({ revision: 1, data: {} }).expect(200);
  assert.equal(saved.body.item.data.demonstration, true);
  await request(app).patch(`/resignations/${id}`).set('X-CSRF-Token', 'synthetic').send({ revision: 0, data: {} }).expect(409);
});

test('verified submission freezes PDF, records provider acceptance, and prevents concurrent/replayed sending', async t => {
  const { app, database, draft, sends } = await fixture(t, { verified: true });
  await post(app, `/resignations/${draft.id}/submit`, { revision: 1 }).expect(409);
  const responses = await Promise.all([1, 2].map(() => post(app, `/resignations/${draft.id}/submit`, { confirm: true, revision: 1 })));
  assert.ok(responses.some(r => r.status === 200));
  await post(app, `/resignations/${draft.id}/submit`, { confirm: true, revision: 1 }).expect(200);
  assert.equal(sends(), 1);
  const doc = await database.getSubmission(draft.id);
  assert.equal(doc.status, 'SENT'); assert.equal(doc.data._delivery.messageId, 'synthetic-message');
  assert.equal(doc.data._delivery.recipient, 'juhatus@noortetugi.ee');
  assert.equal(Buffer.from(doc.data._delivery.pdfBase64, 'base64').toString(), '%PDF-synthetic');
  const fetched = await request(app).get(`/resignations/${draft.id}`).expect(200);
  assert.equal(fetched.body.item.delivery.pdfBase64, undefined);
  await request(app).patch(`/resignations/${draft.id}`).set('X-CSRF-Token', 'synthetic').send({ revision: doc.revision, data: ordinary() }).expect(409);
});

test('ambiguous SMTP errors preserve the PDF and cannot be blindly retried', async t => {
  const { app, database, draft, sends } = await fixture(t, { verified: true, outcome: 'timeout' });
  const response = await post(app, `/resignations/${draft.id}/submit`, { confirm: true, revision: 1 }).expect(409);
  assert.equal(response.body.item.status, 'UNCERTAIN'); assert.doesNotMatch(JSON.stringify(response.body), /private provider/);
  assert.ok((await database.getSubmission(draft.id)).data._delivery.pdfBase64);
  await post(app, `/resignations/${draft.id}/submit`, { confirm: true, revision: 3 }).expect(409);
  assert.equal(sends(), 1);
});

test('definite rejection is preserved as failed rather than falsely accepted', async t => {
  const { app, database, draft } = await fixture(t, { verified: true, outcome: 'rejected' });
  await post(app, `/resignations/${draft.id}/submit`, { confirm: true, revision: 1 }).expect(409);
  assert.equal((await database.getSubmission(draft.id)).status, 'SEND_FAILED');
});

test('existing mail transport uses configured sender, verified reply-to and the exact declaration/attachment', async () => {
  let message;
  const service = createMailService({ mailFrom: 'app@example.test', financeNotificationEmail: 'finance@example.test' }, { transport: { async sendMail(m) { message = m; return { accepted: [organization.email] }; } } });
  const data = final(ordinary());
  await service.sendResignation({ document: { id: 'synthetic', data }, pdf: Buffer.from('pdf'), filename: 'notice.pdf', verifiedEmail: 'employee@example.test' });
  assert.equal(message.to, organization.email); assert.equal(message.from, 'app@example.test'); assert.equal(message.replyTo, 'employee@example.test');
  assert.match(message.text, /ütlen.*korraliselt üles/); assert.match(message.text, /TLS § 85 lg 1/);
  assert.equal(message.attachments[0].content.toString(), 'pdf'); assert.doesNotMatch(message.text, /Allkirjastatud digitaalselt/);
});

test('AI correction preserves dates and uses the existing non-storing provider with narrow legal instructions', async () => {
  let options;
  const ai = createAiAssistant({ openAiModel: 'synthetic' }, { client: { responses: { async create(o) { options = o; return { output_text: 'Töötasu on alates 10.11.2026 maksmata.' }; } } } });
  assert.equal(await ai.improve({ text: 'Töötasu on alates 10.11.2026 maksmata.', field: 'resignation.reason', mode: 'fix_language', language: 'et' }), 'Töötasu on alates 10.11.2026 maksmata.');
  assert.equal(options.store, false); assert.match(options.instructions, /Never add a legal ground/);
  const changing = createAiAssistant({ openAiModel: 'synthetic' }, { client: { responses: { async create() { return { output_text: 'Töötasu on alates 11.11.2026 maksmata.' }; } } } });
  await assert.rejects(changing.improve({ text: 'Töötasu on alates 10.11.2026 maksmata.', field: 'resignation.reason', mode: 'fix_language', language: 'et' }), { code: 'AI_FACT_GUARD_REJECTED' });
});
