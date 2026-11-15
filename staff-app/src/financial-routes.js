import { Router } from "express";
import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import { createInvoiceNotifier, invoiceSnapshotKey as snapshotKey } from './invoice-notifications.js';
import { waitUntil } from '@vercel/functions';
import { assertInvoiceAttachments, INVOICE_COPY_EMAIL } from './mail.js';
import { safeOperationalError } from './safe-errors.js';
import { generateFinancialDocx, financialFilename, financialFileStem, DOCX_MIME } from './financial-docx.js';
import { money } from '../public/financial-values.js';
import { z } from "zod";
import { completeDraftIssuer, financialIssuer } from "./organization.js";
import {
  validateFinancialData,
  deliverySchema,
} from "./financial-validation.js";
const uuid = z.string().uuid();
export function financialRoutes({
  database,
  auth,
  mailService,
  limiter,
  issuer = financialIssuer,
  background = waitUntil,
  logger = console,
}) {
  const router = Router();
  const financeEmail = mailService.financeEmail;
  // Authentication and CSRF reuse the existing middleware, authorization is checked for EVERY route.
  router.use(auth.requireSession, async (req, res, next) => {
    try {
      if (!(await database.hasFinancialAccess(req.user.id)))
        return res.status(403).json({ error: "FORBIDDEN" });
      next();
    } catch (error) {
      next(error);
    }
  });
  router.use((req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    if (!["GET", "HEAD"].includes(req.method))
      return limiter(req, res, () => auth.verifyCsrf(req, res, next));
    next();
  });
  const route = (fn) => async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof z.ZodError)
        return res
          .status(422)
          .json({ error: "Kontrollige sisestatud andmeid." });
      if ([409, 422, 503].includes(error.status))
        return res.status(error.status).json({ error: error.message });
      next(error);
    }
  };
  async function get(id) {
    const doc = await database.getFinancialDocument(uuid.parse(id));
    if (!doc)
      throw Object.assign(new Error("Dokumenti ei leitud."), { status: 422 });
    return doc.status === 'DRAFT' ? { ...doc, issuer: completeDraftIssuer(doc.issuer, issuer()) } : doc;
  }
  async function generate(doc, format) {
    const correction_number = doc.correction_of ? (await get(doc.correction_of)).number : undefined;
    const record = { ...doc, correction_number };
    try {
      if (format === 'docx') return await generateFinancialDocx(record);
      const { generateFinancialPdf } = await import('./financial-pdf.js');
      return await generateFinancialPdf(record);
    } catch (error) {
      logger.error('financial_document_generation_failed', safeOperationalError(error, 'DOCUMENT_GENERATION_FAILED'));
      throw Object.assign(new Error(`Dokumendi ${format.toUpperCase()}-faili loomine ebaõnnestus.`), { status: 503 });
    }
  }
  async function artifact(doc, stored, format) {
    return Buffer.from(stored?.[format] || await generate(doc, format));
  }
  async function invoiceFormats(doc, stored) {
    const { totals } = validateFinancialData(doc.data, doc.issuer, true);
    if (!isDeepStrictEqual(totals, doc.data.totals))
      throw Object.assign(new Error('Arve summad ei vasta salvestatud arveridadele.'), { status: 422 });
    const [pdf, docx] = await Promise.all([artifact(doc, stored, 'pdf'), artifact(doc, stored, 'docx')]);
    assertInvoiceAttachments(pdf, docx);
    return { pdf, docx };
  }
  async function storedArtifacts(doc) {
    return doc.status === 'DRAFT' ? null : database.getFinancialDocument(doc.id, true);
  }
  const acceptedBy = (result, recipient) => (result.accepted || []).some(v => String(v).toLowerCase() === recipient.toLowerCase());
  function logFailure(event, error) {
    logger.error(event, safeOperationalError(error, 'INVOICE_EMAIL_UNCERTAIN'));
  }
  const notifyDownload = createInvoiceNotifier({ database, mailService, logger });
  async function copyDownload(doc, stored, actor) {
    try {
      await notifyDownload(doc, await invoiceFormats(doc, stored), actor);
    } catch (error) { logFailure('invoice_download_artifact_failed', error); }
  }
  router.get(
    "/settings",
    route(async (_req, res) =>
      res.json({
        issuer: issuer(),
        financeEmail,
        invoiceCopyEmail: INVOICE_COPY_EMAIL,
      }),
    ),
  );
  router.get(
    "/",
    route(async (req, res) =>
      res.json(
        await database.listFinancialDocuments({
          search: String(req.query.search || ""),
          status: String(req.query.status || ""),
          offset: req.query.offset,
          kind: z.enum(["", "invoice", "quotation"]).parse(req.query.kind || ""),
        }),
      ),
    ),
  );
  router.post(
    "/",
    route(async (req, res) => {
      const kind = z.enum(["invoice", "quotation"]).parse(req.body.kind);
      const org = issuer();
      if (!org)
        return res
          .status(503)
          .json({
            error: "Käibemaksu staatus vajab administraatori kinnitust.",
          });
      const document = await database.createFinancialDocument({
        id: uuid.parse(req.body.id),
        kind,
        data: validateFinancialData(req.body.data, org),
        issuer: org,
        actor: req.user.id,
        correctionOf: req.body.correctionOf
          ? uuid.parse(req.body.correctionOf)
          : null,
      });
      res.status(201).json({ document });
    }),
  );
  router.get(
    "/:id",
    route(async (req, res) =>
      res.json({
        document: await get(req.params.id),
        history: await database.financialHistory(req.params.id),
      }),
    ),
  );
  router.patch(
    "/:id",
    route(async (req, res) => {
      const doc = await get(req.params.id);
      const document = await database.updateFinancialDocument({
        id: doc.id,
        version: z.number().int().positive().parse(req.body.version),
        data: validateFinancialData(req.body.data, doc.issuer),
        issuer: doc.issuer,
        actor: req.user.id,
      });
      res.json({ document });
    }),
  );
  router.get(
    "/:id/pdf",
    route(async (req, res) => {
      const doc = await get(req.params.id);
      validateFinancialData(doc.data, doc.issuer, true);
      const stored = await storedArtifacts(doc);
      if (stored && !stored.pdf && doc.kind === 'quotation')
        return res.status(409).json({ error: 'Dokument on Wordi vormingus. Laadige alla Wordi fail.' });
      const buffer = await artifact(doc, stored, 'pdf');
      res
        .set({
          "Content-Type": "application/pdf",
          "Content-Disposition": `${req.query.download === "1" ? "attachment" : "inline"}; filename="${financialFileStem(doc.number)}.pdf"`,
        })
        .send(buffer);
      if (doc.kind === 'invoice' && req.method === 'GET' && req.query.download === '1')
        background(copyDownload(doc, { ...stored, pdf: buffer }, req.user.id));
    }),
  );
  router.get('/:id/docx', route(async (req,res) => {
    const doc = await get(req.params.id);
    validateFinancialData(doc.data, doc.issuer, true);
    const stored = await storedArtifacts(doc);
    const buffer = await artifact(doc, stored, 'docx');
    res.set({ 'Content-Type': DOCX_MIME,
      'Content-Disposition': `attachment; filename="${financialFilename(doc)}"` }).send(buffer);
    if (doc.kind === 'invoice' && req.method === 'GET')
      background(copyDownload(doc, { ...stored, docx: buffer }, req.user.id));
  }));
  router.post(
    "/:id/finalize",
    route(async (req, res) => {
      const doc = await get(req.params.id);
      if (doc.status !== "DRAFT")
        return res.status(409).json({ error: "Dokument on juba kinnitatud." });
      if (doc.kind === 'quotation') validateFinancialData(doc.data, doc.issuer, true);
      if (req.body.version !== doc.version)
        return res.status(409).json({ error: "Dokument on muutunud." });
      const { docx, pdf } = doc.kind === 'invoice'
        ? await invoiceFormats(doc, null)
        : { docx: await generate(doc, 'docx'), pdf: null };
      const recipient = doc.kind === 'invoice' ? INVOICE_COPY_EMAIL : financeEmail;
      const title = doc.kind === 'invoice' ? 'arve' : 'hinnapakkumine';
      const confirmation = {
        deliveryId: randomUUID(), recipient,
        ...(pdf ? { snapshotKey: snapshotKey(doc) } : {}),
        subject: `Kinnitatud ${title} – ${doc.number}`,
        message: [`Kinnitatud ${title}: ${doc.number}`, `Tellija: ${doc.data.customer}`,
          `Kogusumma: ${money(doc.data.totals.total)}`,
          `Kinnitamise aeg: ${new Date().toLocaleString('et-EE', { timeZone: 'Europe/Tallinn' })}`,
          `Kinnitaja: ${req.user.name}`, '', pdf ? 'Kinnitatud arve PDF- ja Wordi failid on manuses.' : 'Kinnitatud dokument on lisatud Wordi failina (DOCX).'].join('\n'),
      };
      let document = await database.finalizeFinancialDocument({
          id: doc.id,
          version: doc.version,
          issuer: doc.issuer,
          docx,
          pdf,
          actor: req.user.id,
          confirmation,
      });
      const claimed = document.confirmationClaimed;
      delete document.confirmationClaimed;
      if (!claimed) return res.json({ document, confirmationDelivery: document.confirmation_delivery_status });
      let accepted = false;
      try {
        const result = await mailService.sendFinancialDocument({ ...confirmation, number: doc.number, pdf, docx, filename: financialFilename(doc), invoiceCopy: doc.kind === 'invoice' });
        accepted = acceptedBy(result, recipient);
        if (!accepted) logFailure('financial_confirmation_email_unaccepted', null);
      } catch (error) { logFailure('financial_confirmation_email_failed', error); }
      let warning = accepted ? '' : 'Dokument on kinnitatud, kuid e-kirja saatmine ebaõnnestus või vajab kontrolli. Ärge saatke uuesti enne postkasti kontrollimist.';
      try {
        document = await database.finishFinancialConfirmation({ id: doc.id, deliveryId: confirmation.deliveryId, actor: req.user.id, accepted });
      } catch (error) {
        logFailure('financial_confirmation_status_failed', error);
        warning = 'Dokument on kinnitatud, kuid e-kirja saatmise staatuse salvestamine vajab administraatori kontrolli. Ärge saatke uuesti.';
      }
      res.json({ document, confirmationDelivery: accepted ? 'SENT' : 'UNCERTAIN', ...(warning ? { warning } : {}) });
    }),
  );
  router.post(
    "/:id/send",
    route(async (req, res) => {
      const message = deliverySchema.parse(req.body);
      const doc = await get(req.params.id);
      if (doc.confirmation_delivery_status && message.recipient.toLowerCase() === (doc.kind === 'invoice' ? INVOICE_COPY_EMAIL : financeEmail)?.toLowerCase())
        return res.status(409).json({ error: 'Kinnitamise e-kiri on juba töödeldud. Kordussaatmine pole lubatud.' });
      if (!mailService.available)
        return res
          .status(503)
          .json({ error: "E-posti saatmine ei ole seadistatud." });
      if (doc.status !== 'READY')
        return res.status(409).json({ error: 'Dokument ei ole saatmiseks valmis.' });
      // Prepare any missing historical invoice format before creating a delivery claim.
      const invoice = doc.kind === 'invoice';
      const attachments = invoice ? await invoiceFormats(doc, await storedArtifacts(doc)) : null;
      const { row, deliveryId } = await database.claimFinancialDelivery({
        id: doc.id,
        actor: req.user.id,
        ...message,
      });
      let accepted = false;
      try {
        const result = await mailService.sendFinancialDocument({
          ...message,
          number: row.number,
          pdf: attachments?.pdf ?? row.pdf,
          docx: attachments?.docx ?? row.docx,
          invoice,
          filename: financialFilename(row),
          deliveryId,
        });
        const recipients = [
          ...new Set([
            message.recipient.toLowerCase(),
            financeEmail?.toLowerCase(),
          ]),
        ];
        accepted = recipients.every((email) =>
          (result.accepted || []).some(
            (v) => String(v).toLowerCase() === email,
          ),
        );
      } catch {
        /* SMTP outcomes can be ambiguous: never automatically retry a financial email. */
      }
      const document = await database.finishFinancialDelivery({
        id: doc.id,
        deliveryId,
        actor: req.user.id,
        accepted,
      });
      res
        .status(accepted ? 200 : 409)
        .json({
          document,
          ...(!accepted
            ? {
                error:
                  "Saatmise tulemus vajab kontrolli. Ärge saatke uuesti enne postkasti kontrollimist.",
              }
            : {}),
        });
    }),
  );
  return router;
}
