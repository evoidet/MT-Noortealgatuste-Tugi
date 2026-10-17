import { Router } from "express";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { financialIssuer } from "./organization.js";
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
}) {
  const router = Router();
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
    return doc;
  }
  async function pdf(doc) {
    const { generateFinancialPdf } = await import("./financial-pdf.js");
    if (doc.correction_of)
      doc.correction_number = (await get(doc.correction_of)).number;
    return generateFinancialPdf(doc);
  }
  router.get(
    "/settings",
    route(async (_req, res) =>
      res.json({
        issuer: issuer(),
        financeEmail: "egor.stepanov@noortetugi.ee",
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
      const org = issuer();
      if (!org)
        return res
          .status(503)
          .json({
            error: "Käibemaksu staatus vajab administraatori kinnitust.",
          });
      const document = await database.updateFinancialDocument({
        id: doc.id,
        version: z.number().int().positive().parse(req.body.version),
        data: validateFinancialData(req.body.data, org),
        issuer: org,
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
      const buffer =
        doc.status === "DRAFT"
          ? await pdf(doc)
          : (await database.getFinancialDocument(doc.id, true)).pdf;
      res
        .set({
          "Content-Type": "application/pdf",
          "Content-Disposition": `${req.query.download === "1" ? "attachment" : "inline"}; filename="${doc.number}.pdf"`,
        })
        .send(buffer);
    }),
  );
  router.post(
    "/:id/finalize",
    route(async (req, res) => {
      const doc = await get(req.params.id);
      if (doc.status !== "DRAFT")
        return res.status(409).json({ error: "Dokument on juba kinnitatud." });
      if (!isDeepStrictEqual(issuer(), doc.issuer))
        return res
          .status(409)
          .json({
            error:
              "Organisatsiooni andmed on muutunud. Salvestage mustand uuesti ja kontrollige summat.",
          });
      validateFinancialData(doc.data, doc.issuer, true);
      if (req.body.version !== doc.version)
        return res.status(409).json({ error: "Dokument on muutunud." });
      // The stored PDF has no draft watermark and will never be regenerated after finalization.
      const buffer = await pdf({ ...doc, status: "READY" });
      res.json({
        document: await database.finalizeFinancialDocument({
          id: doc.id,
          version: doc.version,
          pdf: buffer,
          actor: req.user.id,
        }),
      });
    }),
  );
  router.post(
    "/:id/send",
    route(async (req, res) => {
      const message = deliverySchema.parse(req.body);
      const doc = await get(req.params.id);
      if (!mailService.available)
        return res
          .status(503)
          .json({ error: "E-posti saatmine ei ole seadistatud." });
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
          pdf: row.pdf,
          deliveryId,
        });
        const recipients = [
          ...new Set([
            message.recipient.toLowerCase(),
            "egor.stepanov@noortetugi.ee",
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
