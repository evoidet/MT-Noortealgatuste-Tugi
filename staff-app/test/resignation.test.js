import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import PizZip from 'pizzip';
import { PGlite } from '@electric-sql/pglite';
import { openDatabase } from '../src/database.js';
import { loadMigrations } from '../scripts/db-migrate.mjs';
import { resignationRoutes } from '../src/resignation-routes.js';
import { validateResignation } from '../src/resignation-validation.js';
import { addDays, addMonths, departureDocument, departureTypes, followUp } from '../public/resignation-values.js';
import { canReadSubmission, canEditSubmission } from '../src/permissions.js';
import { generateResignationDocx } from '../src/resignation-pdf.js';
import { organization } from '../src/organization.js';

const applicant = { name: 'Õie Ööäär', email: 'person@example.test', noticeDate: '2026-11-16' };
const mandate = { kind: 'mandate', actualAgreement: true, termsReviewed: true, contractDate: '2024-01-01',
  contractTerm: 'indefinite', termination: 'ordinary', party: 'provider', alternativePerformance: true,
  receiptDate: '2026-11-17', effectiveDate: '2026-12-01', noticeDays: 14, contractTerms: 'Etteteatamise tähtaeg on 14 päeva.' };
const finalize = (...actions) => validateResignation({ ...applicant, actions }, { final: true });

test('each departure generates its own title, recipient, declaration and unsigned signature field', async () => {
  const data = finalize({ kind: 'board', role: 'Finantsjuht', boardCount: 3 },
    { kind: 'member' }, { kind: 'volunteer', role: 'Ürituste korraldamine', writtenAgreement: true }, mandate);
  for (const action of data.actions) {
    const model = departureDocument(data, action, organization);
    assert.equal(model.recipient, action.kind === 'board' ? 'Üldkoosolek' : 'Juhatus');
    assert.equal(model.title, departureTypes[action.kind].title);
    assert.match(model.applicant.join(' '), /Õie Ööäär/);
    assert.match(model.applicant.join(' '), /16\.11\.2026/);
    assert.doesNotMatch(model.paragraphs.join(' '), /tööleping|tööandja|kinnitage avaldus|digitaalselt allkirjastatud/i);
    const docx = new PizZip(await generateResignationDocx(model)).file('word/document.xml').asText();
    for (const line of [model.title, model.signature, ...model.address, ...model.applicant, ...model.paragraphs]) assert.ok(docx.includes(line), line);
  }
  assert.match(followUp(data.actions[0]).join(' '), /alla kolme/);
  assert.doesNotMatch(followUp({ kind: 'board', boardCount: 4 }).join(' '), /alla kolme/);
  assert.match(followUp({ kind: 'board' }).join(' '), /kontrollige juhatuse koosseisu/i);
  assert.match(followUp(data.actions[1])[0], /liikmete nimekirja/);
  assert.match(followUp(data.actions[2])[0], /kirjaliku/);
  assert.match(departureDocument(data, data.actions[0], organization).paragraphs[0], /astun tagasi/);
  assert.doesNotMatch(departureDocument(data, data.actions[0], organization).paragraphs.join(' '), /liikmeskonnast/);
  assert.match(departureDocument(data, data.actions[1], organization).paragraphs[0], /omal soovil/);
});

test('validation distinguishes roles, actual agreements, contract notice periods and legal grounds', () => {
  assert.throws(() => finalize({ kind: 'member' }, { kind: 'member' }));
  assert.throws(() => finalize({ kind: 'member', effectiveDate: '2026-11-15' }));
  assert.throws(() => finalize({ kind: 'member', effectiveDate: '2026-02-29' }));
  assert.throws(() => finalize({ kind: 'volunteer' }), /rolli/);
  assert.throws(() => finalize({ ...mandate, actualAgreement: false }), /lepingu/);
  assert.throws(() => finalize({ ...mandate, termsReviewed: false }), /kontrollimine/);
  assert.throws(() => finalize({ ...mandate, alternativePerformance: false }), /630 lg 2/);
  assert.throws(() => finalize({ ...mandate, effectiveDate: '2026-11-30' }), /etteteatamistähtaja/);
  assert.throws(() => finalize({ ...mandate, contractTerm: 'fixed' }), /lepingus sätestatud/);
  assert.throws(() => finalize({ ...mandate, contractTerm: 'long' }), /viie aasta/);
  assert.doesNotThrow(() => finalize({ ...mandate, contractTerm: 'long', contractDate: '2021-01-01', effectiveDate: '2027-05-17' }));
  assert.throws(() => finalize({ ...mandate, termination: 'extraordinary' }), /asjaolusid/);
  assert.doesNotThrow(() => finalize({ ...mandate, termination: 'extraordinary', contractTerm: 'fixed', reason: 'Testpõhjus.' }));
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addMonths('2026-08-31', 6), '2027-02-28');
});

test('private batch has revision-gated review, separate exports and manual progress without changing roles', async t => {
  const engine = new PGlite();
  t.after(() => engine.close());
  for (const migration of await loadMigrations()) await engine.exec(migration.sql);
  const client = { query: (sql, params) => engine.query(sql, params), release() {} };
  const database = openDatabase(null, { pool: { query: client.query, async connect() { return client; }, async end() {} } });
  const user = await database.upsertUser({ googleSubject: 'synthetic-departure', email: applicant.email, name: applicant.name, role: 'member' });
  // The test database has one connection. Production holds a separate advisory lock connection.
  database.withSubmissionLock = async (_id, work) => work();
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    if (req.get('Actor') === 'none') return res.sendStatus(401);
    req.user = req.get('Actor') === 'other' ? { ...user, id: 'other', role: 'admin' } : user;
    next();
  });
  app.use('/resignations', resignationRoutes({ database, limiter: (_req, _res, next) => next(),
    auth: { verifyCsrf(req, res, next) { return req.get('X-CSRF-Token') === 'synthetic' ? next() : res.sendStatus(403); } } }));
  const post = (path, data) => request(app).post(path).set('X-CSRF-Token', 'synthetic').send(data);
  const input = { ...applicant, actions: [{ kind: 'board', boardCount: 3 }, { kind: 'member' }] };
  const id = randomUUID();
  await request(app).post('/resignations').send({ id, data: input }).expect(403);
  await post('/resignations', { id, data: { ...input, _workflow: {} } }).expect(422);
  const { body: created } = await post('/resignations', { id, data: input }).expect(201);
  assert.equal((await post('/resignations', { id, data: input }).expect(201)).body.item.id, created.item.id);
  const base = '/resignations/' + created.item.id;
  await request(app).get(base).set('Actor', 'none').expect(401);
  await request(app).get(base).set('Actor', 'other').expect(404);
  assert.equal(canReadSubmission({ id: 'other', role: 'admin' }, created.item), false);
  assert.equal(canEditSubmission(user, created.item), false);
  await request(app).get(base + '/documents/board/pdf?revision=1').expect(409);
  await post(base + '/preview', { revision: 0 }).expect(409);
  const review = await post(base + '/preview', { revision: 1 }).expect(200);
  assert.deepEqual(review.body.documents.map(doc => doc.kind), ['board', 'member']);
  await post(base + '/prepare', { revision: 1, confirm: false }).expect(409);
  const prepared = (await post(base + '/prepare', { revision: 1, confirm: true }).expect(200)).body.item;
  assert.equal(prepared.workflow.progress.board.status, 'prepared');
  const query = '?revision=' + prepared.revision;
  const bytes = response => new Promise(resolve => {
    const parts = [];
    response.on('data', chunk => parts.push(chunk));
    response.on('end', () => resolve(Buffer.concat(parts)));
  });
  for (const kind of ['board', 'member']) {
    const download = format => request(app).get(base + '/documents/' + kind + '/' + format + query);
    const pdf = await download('pdf').expect(200);
    assert.equal(pdf.body.subarray(0, 5).toString(), '%PDF-');
    assert.match(pdf.headers['cache-control'], /private, no-store/);
    const docx = await download('docx').buffer(true).parse((response, done) => bytes(response).then(data => done(null, data), done)).expect(200);
    assert.match(new PizZip(docx.body).file('word/document.xml').asText(), new RegExp(departureTypes[kind].title));
    await download('docx').set('Actor', 'other').expect(404);
  }
  await request(app).get(base + '/documents/volunteer/pdf' + query).expect(404);
  await post(base + '/progress', { revision: prepared.revision, kind: 'board', status: 'received', confirm: true }).expect(409);
  let item = prepared;
  for (const status of ['sent', 'received', 'completed']) {
    item = (await post(base + '/progress', { revision: item.revision, kind: 'board', status, confirm: true }).expect(200)).body.item;
    assert.equal(item.workflow.progress.board.status, status);
    assert.equal(item.workflow.progress.member.status, 'prepared');
  }
  await request(app).patch(base).set('X-CSRF-Token', 'synthetic').send({ revision: item.revision, data: input }).expect(409);
  assert.equal((await database.getSubmission(item.id)).status, 'DRAFT');
  assert.equal((await engine.query('SELECT role FROM users WHERE id=$1', [user.id])).rows[0].role, 'member');

  const legacy = await database.createSubmission({ type: 'resignation', creatorId: user.id,
    data: { employeeName: applicant.name, _delivery: { pdfBase64: Buffer.from('%PDF-archive').toString('base64') } } });
  const old = await request(app).get('/resignations/' + legacy.id).expect(200);
  assert.equal(old.body.item.legacyPdf, true);
  assert.equal(old.body.item.data, undefined);
  const archived = await request(app).get('/resignations/' + legacy.id + '/pdf').expect(200);
  assert.equal(archived.body.toString(), '%PDF-archive');
});
