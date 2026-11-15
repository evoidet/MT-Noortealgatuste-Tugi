import { Router } from 'express';
import { z } from 'zod';
import { organization } from './organization.js';
import { validateResignation } from './resignation-validation.js';
import { generateResignationPdf } from './resignation-pdf.js';
import { resignationFilename, tallinnToday } from '../public/resignation-values.js';
import { downloadFilenameHeader } from './storage.js';

export const submissionUnavailable = 'Elektrooniline esitamine ei ole veel toetatud: süsteemis puudub kontrollitud seos konto ja töötaja töösuhte vahel. Salvestage ja laadige avaldus alla ning esitage see ise tuvastataval viisil.';
const uuid = z.string().uuid();
const editable = doc => doc.status === 'DRAFT';
const payload = doc => {
  const { _delivery, ...data } = doc.data;
  const { pdfBase64, ...delivery } = _delivery || {};
  return { ...doc, data, delivery: _delivery ? delivery : null };
};

// verifyEmployee is a trusted server integration, NEVER a client assertion or
// name match. No employment registry exists today, so production fails closed.
export function resignationRoutes({ database, auth, mailService, limiter,
  verifyEmployee = null, pdfGenerator = generateResignationPdf }) {
  const router = Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    if (!['GET', 'HEAD'].includes(req.method)) return limiter(req, res, () => auth.verifyCsrf(req, res, next));
    next();
  });
  const route = work => async (req, res, next) => {
    try { await work(req, res); } catch (e) {
      if (e instanceof z.ZodError) return res.status(422).json({ error: 'Kontrollige sisestatud andmeid.' });
      if ([404, 409, 422, 503].includes(e.status)) return res.status(e.status).json({ error: e.message, issues: e.issues });
      next(e);
    }
  };
  async function own(req) {
    const doc = await database.getSubmission(uuid.parse(req.params.id));
    if (!doc || doc.type !== 'resignation' || doc.creatorId !== req.user.id)
      throw Object.assign(new Error('Avaldust ei leitud.'), { status: 404 });
    return doc;
  }
  router.get('/settings', route(async (_req, res) => res.json({ employer: {
    name: organization.name, registrationCode: organization.registrationCode, address: organization.address
  }, recipient: organization.email, submissionSupported: typeof verifyEmployee === 'function',
    submissionExplanation: typeof verifyEmployee === 'function' ? 'Esitada saab ainult kontrollitud töösuhtega töötaja enda kinnitatud avalduse.' : submissionUnavailable })));
  router.get('/', route(async (req, res) => res.json({ items: (await database.listSubmissionsByCreator(req.user.id, { type: 'resignation' })).map(payload) })));
  router.post('/', route(async (req, res) => {
    const data = validateResignation(req.body.data);
    const item = await database.createSubmission({ type: 'resignation', creatorId: req.user.id, data, idempotencyKey: uuid.parse(req.body.id) });
    res.status(201).json({ item: payload(item) });
  }));
  router.get('/:id', route(async (req, res) => res.json({ item: payload(await own(req)) })));
  router.patch('/:id', route(async (req, res) => database.withSubmissionLock(req.params.id, async () => {
    const doc = await own(req);
    if (!editable(doc) || req.body.revision !== doc.revision) return res.status(409).json({ error: 'Avaldus on muutunud või lukustatud. Avage salvestatud versioon uuesti.' });
    const data = validateResignation(req.body.data);
    // Once a document has been demonstration data it cannot be promoted into
    // an actual declaration by deleting a client-side flag.
    if (doc.data.demonstration) data.demonstration = true;
    const item = await database.updateSubmission({ id: doc.id, userId: req.user.id, data });
    res.json({ item: payload(item) });
  })));
  router.post('/:id/preview', route(async (req, res) => {
    const doc = await own(req);
    if (req.body.revision !== doc.revision) return res.status(409).json({ error: 'Avaldus on vahepeal muutunud. Avage salvestatud versioon uuesti.' });
    const { _delivery, ...input } = doc.data;
    if (!_delivery) validateResignation(input, { final: true });
    res.json({ revision: doc.revision, pdfUrl: `/api/staff/resignations/${doc.id}/pdf?revision=${doc.revision}` });
  }));
  router.get('/:id/pdf', route(async (req, res) => {
    const doc = await own(req);
    if (req.query.revision !== undefined && Number(req.query.revision) !== doc.revision)
      return res.status(409).json({ error: 'Eelvaade on aegunud. Avage avaldus uuesti.' });
    const { _delivery, ...input } = doc.data;
    // Always return the exact preserved attachment after confirmation.
    const buffer = _delivery?.pdfBase64 ? Buffer.from(_delivery.pdfBase64, 'base64')
      : await pdfGenerator(validateResignation(input, { final: true }), organization);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': downloadFilenameHeader(resignationFilename(input)).replace(/^attachment/, req.query.download === '1' ? 'attachment' : 'inline'),
      'X-Frame-Options': 'SAMEORIGIN', 'Content-Security-Policy': "frame-ancestors 'self'; object-src 'none'; base-uri 'none'" });
    res.send(buffer);
  }));
  router.post('/:id/submit', route(async (req, res) => database.withSubmissionLock(req.params.id, async () => {
    let doc = await own(req);
    if (doc.status === 'SENT') return res.json({ item: payload(doc), replayed: true });
    if (!['DRAFT', 'SEND_FAILED'].includes(doc.status)) return res.status(409).json({ error: 'Saatmise tulemus vajab kontrollimist. Avaldust ei saadeta uuesti.' });
    if (req.body.confirm !== true || req.body.revision !== doc.revision)
      return res.status(409).json({ error: 'Vaadake lõplik avaldus üle ja kinnitage esitamine.' });
    const { _delivery, ...input } = doc.data;
    const data = validateResignation(input, { final: true, submitting: true });
    const identity = await verifyEmployee?.({ user: req.user, document: doc });
    if (!identity || identity.userId !== req.user.id || identity.employeeName !== data.employeeName ||
        !identity.employmentVerified || !identity.authorizationVerified || !z.email().safeParse(identity.email).success)
      return res.status(409).json({ error: submissionUnavailable });
    if (!z.email().safeParse(organization.email).success || !mailService.available)
      return res.status(503).json({ error: 'E-posti saatmine ei ole seadistatud. Avaldus on alles.' });
    if (data.receiptDate || (data.submissionDate && data.submissionDate !== tallinnToday()))
      return res.status(422).json({ error: 'Uue elektroonilise esitamise kättesaamise aeg ei ole veel teada. Eemaldage varasema esitamise ja kättesaamise kuupäevad.' });
    const pdf = await pdfGenerator(data, organization);
    doc = await database.claimResignation({ id: doc.id, userId: req.user.id, revision: doc.revision,
      delivery: { recipient: organization.email, actorId: req.user.id, verifiedEmail: identity.email,
        confirmedAt: new Date().toISOString(), employer: { name: organization.name, registrationCode: organization.registrationCode, address: organization.address }, pdfBase64: pdf.toString('base64') } });
    let result, status, errorCode = null;
    try {
      result = await mailService.sendResignation({ document: { ...doc, data }, pdf, filename: resignationFilename(data), verifiedEmail: identity.email });
      status = (result.accepted || []).some(v => String(v).toLowerCase() === organization.email) ? 'SENT'
        : (result.rejected || []).some(v => String(v).toLowerCase() === organization.email) ? 'SEND_FAILED' : 'UNCERTAIN';
    } catch (e) {
      // An explicit negative SMTP reply means rejection. Timeouts/disconnects
      // may happen after acceptance; never resend those automatically.
      status = e.responseCode >= 400 && e.responseCode <= 599 ? 'SEND_FAILED' : 'UNCERTAIN';
      errorCode = status === 'SEND_FAILED' ? 'SMTP_REJECTED' : 'SMTP_OUTCOME_UNKNOWN';
    }
    const item = await database.finishResignation({ id: doc.id, userId: req.user.id, status,
      messageId: typeof result?.messageId === 'string' ? result.messageId.slice(0, 250) : null, errorCode });
    res.status(status === 'SENT' ? 200 : 409).json({ item: payload(item), ...(status === 'SENT' ? {} : { error: status === 'SEND_FAILED' ? 'E-posti teenus lükkas kirja tagasi. Avaldus on alles.' : 'Saatmise tulemus ei ole teada. Kontrollige enne uut katset saatmise tulemust.' }) });
  })));
  return router;
}
