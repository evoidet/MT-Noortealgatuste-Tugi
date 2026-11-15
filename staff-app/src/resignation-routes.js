import { Router } from 'express';
import { z } from 'zod';
import { organization } from './organization.js';
import { validateResignation } from './resignation-validation.js';
import { generateResignationPdf, generateResignationDocx } from './resignation-pdf.js';
import { departureDocument, followUp, nextProgress } from '../public/resignation-values.js';
import { downloadFilenameHeader } from './storage.js';
import { DOCX_MIME } from './financial-docx.js';

const uuid = z.string().uuid();
const kindSchema = z.enum(['board', 'member', 'volunteer', 'mandate']);
const organizationDetails = () => ({ name: organization.name, registrationCode: organization.registrationCode, address: organization.address });
const isLegacy = doc => !Array.isArray(doc.data.actions);
const payload = doc => {
  const { data, ...record } = doc;
  if (isLegacy(doc)) return { ...record, legacy: true, legacyPdf: Boolean(data._delivery?.pdfBase64) };
  const { _workflow, ...fields } = data;
  return { ...record, data: fields, workflow: _workflow || null };
};
const conflict = message => Object.assign(new Error(message), { status: 409 });

export function resignationRoutes({ database, auth, limiter }) {
  const router = Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    if (!['GET', 'HEAD'].includes(req.method)) return limiter(req, res, () => auth.verifyCsrf(req, res, next));
    next();
  });
  const route = work => async (req, res, next) => {
    try { await work(req, res); } catch (e) {
      if (e instanceof z.ZodError) return res.status(422).json({ error: 'Kontrollige sisestatud andmeid.', issues: e.issues });
      if ([404, 409, 422].includes(e.status)) return res.status(e.status).json({ error: e.message });
      next(e);
    }
  };
  async function own(req) {
    const doc = await database.getSubmission(uuid.parse(req.params.id));
    if (!doc || doc.type !== 'resignation' || doc.creatorId !== req.user.id)
      throw Object.assign(new Error('Avaldust ei leitud.'), { status: 404 });
    return doc;
  }
  function checkRevision(doc, revision) {
    if (revision !== doc.revision) throw conflict('Avaldus on muutunud. Avage salvestatud versioon uuesti.');
  }
  function review(doc) {
    if (isLegacy(doc)) throw conflict('Varasem avaldus on arhiivis. Koostamiseks avage uus avaldus.');
    const { _workflow, ...input } = doc.data;
    return validateResignation(input, { final: true });
  }
  function mutate(work) {
    return route(async (req, res) => database.withSubmissionLock(uuid.parse(req.params.id), async () => {
      const doc = await own(req);
      checkRevision(doc, req.body.revision);
      await work(req, res, doc);
    }));
  }
  async function save(doc, userId, data, event) {
    return payload(await database.updateSubmission({ id: doc.id, userId, data, event }));
  }

  router.get('/settings', route(async (_req, res) => res.json({ organization: organizationDetails() })));
  router.get('/', route(async (req, res) => res.json({
    items: (await database.listSubmissionsByCreator(req.user.id, { type: 'resignation' })).map(payload),
  })));
  router.post('/', route(async (req, res) => {
    const data = validateResignation(req.body.data);
    const item = await database.createSubmission({ type: 'resignation', creatorId: req.user.id, data, idempotencyKey: uuid.parse(req.body.id) });
    res.status(201).json({ item: payload(item) });
  }));
  router.get('/:id', route(async (req, res) => res.json({ item: payload(await own(req)) })));
  router.patch('/:id', mutate(async (req, res, doc) => {
    if (isLegacy(doc) || doc.data._workflow || doc.status !== 'DRAFT') throw conflict('Avaldus on lukustatud. Muudatusteks looge uus avaldus.');
    res.json({ item: await save(doc, req.user.id, validateResignation(req.body.data), 'UPDATED') });
  }));
  router.post('/:id/preview', route(async (req, res) => {
    const doc = await own(req);
    checkRevision(doc, req.body.revision);
    const data = review(doc);
    const org = doc.data._workflow?.organization || organizationDetails();
    res.json({ revision: doc.revision, documents: data.actions.map(action => ({
      kind: action.kind, ...departureDocument(data, action, org), followUp: followUp(action),
    })) });
  }));
  router.post('/:id/prepare', mutate(async (req, res, doc) => {
    if (req.body.confirm !== true || doc.data._workflow || doc.status !== 'DRAFT')
      throw conflict('Vaadake valitud avaldused üle ja kinnitage nende koostamine.');
    const data = review(doc);
    const now = new Date().toISOString();
    const progress = Object.fromEntries(data.actions.map(action => [action.kind, { status: 'prepared', at: now }]));
    const _workflow = { organization: organizationDetails(), progress };
    res.json({ item: await save(doc, req.user.id, { ...data, _workflow }, 'DEPARTURE_PREPARED') });
  }));
  router.post('/:id/progress', mutate(async (req, res, doc) => {
    const kind = kindSchema.parse(req.body.kind);
    const workflow = doc.data._workflow;
    const next = nextProgress[workflow?.progress[kind]?.status];
    if (!next || req.body.status !== next || req.body.confirm !== true)
      throw conflict('Kinnitage avalduse järgmine toiming.');
    const progress = { ...workflow.progress, [kind]: { status: next, at: new Date().toISOString() } };
    res.json({ item: await save(doc, req.user.id, { ...doc.data, _workflow: { ...workflow, progress } }, 'DEPARTURE_PROGRESS') });
  }));
  router.get('/:id/documents/:kind/:format', route(async (req, res) => {
    const doc = await own(req);
    checkRevision(doc, Number(req.query.revision));
    if (!doc.data._workflow) throw conflict('Vaadake avaldused üle ja kinnitage nende koostamine.');
    const kind = kindSchema.parse(req.params.kind);
    const format = z.enum(['pdf', 'docx']).parse(req.params.format);
    const data = review(doc);
    const action = data.actions.find(entry => entry.kind === kind);
    if (!action) return res.status(404).json({ error: 'Avaldust ei leitud.' });
    const document = departureDocument(data, action, doc.data._workflow.organization);
    const buffer = format === 'pdf' ? await generateResignationPdf(document) : await generateResignationDocx(document);
    res.set({ 'Content-Type': format === 'pdf' ? 'application/pdf' : DOCX_MIME,
      'Content-Disposition': downloadFilenameHeader(document.filename + '.' + format) });
    res.send(buffer);
  }));
  // Archived attachments from the former workflow remain accessible to their owner.
  router.get('/:id/pdf', route(async (req, res) => {
    const doc = await own(req);
    if (!isLegacy(doc) || !doc.data._delivery?.pdfBase64)
      return res.status(404).json({ error: 'Arhiveeritud PDF-i ei leitud.' });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': downloadFilenameHeader('varasem-avaldus.pdf') });
    res.send(Buffer.from(doc.data._delivery.pdfBase64, 'base64'));
  }));
  return router;
}
