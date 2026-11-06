import PizZip from "pizzip";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import request from "supertest";
import express from "express";
import { loadMigrations } from "../scripts/db-migrate.mjs";
import { openDatabase } from "../src/database.js";
import { financialRoutes } from "../src/financial-routes.js";
import { organization, financialIssuer } from "../src/organization.js";
import { totals } from "../public/financial-values.js";
import { validateFinancialData } from "../src/financial-validation.js";
import { createMailService } from "../src/mail.js";
import { policyHasEmail, currentEmail } from "../src/staff-identities.js";
const issuer = {
  ...organization,
  vatRegistered: false,
  vatRate: 0,
  vatNumber: "",
};
const data = {
  date: "2026-10-16",
  dueDate: "2026-10-30",
  customer: "Testklient ÕÄÖÜ",
  address: "Testi 1, Tallinn",
  reference: "Leping 2026-10",
  referenceNumber: "1234561",
  items: [
    {
      description: "Sünteetiline testteenus",
      quantity: "2",
      unit: "tund",
      unitPrice: "123,45",
    },
  ],
  terms: { payment: "14 päeva" },
};

test("decimal money rounds per line, validates dates, rejects unsafe values and recomputes supplied totals", () => {
  assert.deepEqual(
    totals(
      [
        { quantity: "0.5", unitPrice: "0.01" },
        { quantity: "3", unitPrice: "0.10" },
      ],
      24,
    ),
    { lines: [1, 30], subtotal: 31, vat: 7, total: 38 },
  );
  for (const invalid of [-1, NaN, true, {}, "1e3", "0.001"])
    assert.throws(() => totals([{ quantity: 1, unitPrice: invalid }]));
  assert.throws(() =>
    validateFinancialData({ ...data, date: "2026-02-30" }, issuer, true),
  );
  assert.throws(() =>
    validateFinancialData({ ...data, customer: "" }, issuer, true),
  );
  assert.equal(
    validateFinancialData({ ...data, totals: { total: 1 } }, issuer, true)
      .totals.total,
    24690,
  );
  assert.equal(
    currentEmail("EgorStepanov@noortetugi.ee"),
    "egorstepanov@noortetugi.ee",
  );
  assert.equal(
    policyHasEmail(
      new Set(["egor@noortetugi.ee"]),
      "egor.stepanov@noortetugi.ee",
    ),
    true,
  );
  assert.equal(
    policyHasEmail(
      new Set(["mihhail@noortetugi.ee"]),
      "mihhail.komarov@noortetugi.ee",
    ),
    false,
  );
});

test("unfinished draft prices remain blank and cannot be finalized", () => {
  const incomplete = { ...data, items: [{ description: "", quantity: "1", unit: "teenus", unitPrice: "" }] };
  const draft = validateFinancialData(incomplete, issuer);
  assert.equal(draft.items[0].unitPrice, "");
  assert.deepEqual(draft.totals.lines, [null]);
  assert.throws(() => validateFinancialData(draft, issuer, true));
  assert.throws(() => validateFinancialData({ ...incomplete, items: [{ ...incomplete.items[0], quantity: "-2" }] }, issuer));
  assert.throws(() => validateFinancialData({ ...incomplete, items: [{ ...incomplete.items[0], quantity: "", unitPrice: "bad" }] }, issuer));
});

test("blank optional service dates save without copying the invoice issue date", () => {
  const draft = validateFinancialData({ ...data, supplyDate: "" }, issuer);
  assert.equal(draft.supplyDate, undefined);
  assert.equal(draft.date, data.date);
  assert.equal(validateFinancialData({ ...data, supplyDate: "2026-10-15" }, issuer).supplyDate, "2026-10-15");
  assert.throws(() => validateFinancialData({ ...data, supplyDate: "2026-02-30" }, issuer));
});

test("financial lifecycle is private, numbered, durable, immutable and sends only through a mocked SMTP transport", async (t) => {
  const engine = new PGlite();
  t.after(() => engine.close());
  const migrations = await loadMigrations();
  for (const m of migrations) await engine.exec(m.sql);
  let tail = Promise.resolve();
  const pool = {
    query: (s, p) => engine.query(s, p),
    end: async () => {},
    async connect() {
      const before = tail;
      let unlock;
      tail = new Promise((r) => (unlock = r));
      await before;
      return { query: pool.query, release: () => unlock() };
    },
  };
  const db = openDatabase(null, { pool });
  const egor = await db.upsertUser({
    googleSubject: "egor-subject",
    email: "egor.stepanov@noortetugi.ee",
    name: "Egor",
    role: "member",
  });
  const mihhail = await db.upsertUser({
    googleSubject: "komarov-subject",
    email: "mihhail.komarov@noortetugi.ee",
    name: "Mihhail",
    role: "member",
  });
  const other = await db.upsertUser({
    googleSubject: "other-subject",
    email: "mihhail.semiyanov@noortetugi.ee",
    name: "Other Mihhail",
    role: "admin",
  });
  await db.grantVerifiedFinancialAccess(egor);
  await db.grantVerifiedFinancialAccess(mihhail);
  await db.grantVerifiedFinancialAccess(other);
  assert.equal(await db.hasFinancialAccess(other.id), false);
  const changed = await db.upsertUser({
    googleSubject: "egor-subject",
    email: "future.egor@noortetugi.ee",
    name: "Egor",
    role: "member",
  });
  assert.equal(changed.id, egor.id);
  assert.equal(await db.hasFinancialAccess(changed.id), true);
  let sent = [];
  let smtpFailure = false;
  let smtpGate = null;
  let smtpReject = false;
  const mail = createMailService(
    {
      smtpHost: "smtp.invalid",
      mailFrom: "test@example.test",
      financeNotificationEmail: egor.email,
    },
    {
      transport: {
        async sendMail(message) {
          sent.push(message);
          if (smtpGate) await smtpGate;
          if (smtpFailure) throw new Error("test");
          if (smtpReject) return { accepted: [] };
          return { accepted: [message.to, "egor.stepanov@noortetugi.ee"] };
        },
      },
    },
  );
  const app = express();
  const pendingNotifications = [];
  let configuredIssuer = issuer;
  app.use(express.json());
  const auth = {
    requireSession(req, res, next) {
      req.user = [egor, mihhail, other].find(
        (u) => u.id === req.get("x-test-user"),
      );
      if (!req.user) return res.sendStatus(401);
      next();
    },
    verifyCsrf(req, res, next) {
      if (req.get("x-test-csrf") !== "yes") return res.sendStatus(403);
      next();
    },
  };
  app.use(
    "/financial",
    financialRoutes({
      database: db,
      auth,
      mailService: mail,
      issuer: () => configuredIssuer,
      limiter: (_r, _s, n) => n(),
      background: promise => pendingNotifications.push(promise),
      logger: { error() {} },
    }),
  );
  const authorized = (method, path, user = egor) =>
    request(app)
      [method]("/financial" + path)
      .set("x-test-user", user.id)
      .set("x-test-csrf", "yes");
  await request(app).get("/financial").expect(401);
  await authorized("get", "", other).expect(403);
  await request(app)
    .post("/financial")
    .set("x-test-user", egor.id)
    .send({})
    .expect(403);
  const incompleteId = randomUUID();
  const incomplete = await authorized("post", "", mihhail).send({
    id: incompleteId, kind: "quotation",
    data: { ...data, items: [{ description: "", quantity: "1", unit: "teenus", unitPrice: "" }] }
  }).expect(201);
  assert.equal((await authorized("get", "?kind=quotation", mihhail)).body.documents.length, 1);
  assert.equal((await authorized("get", "?kind=invoice", mihhail)).body.documents.length, 0);
  await authorized("get", "?kind=unknown").expect(422);
  await authorized("get", "?kind=invoice", other).expect(403);
  await authorized("post", `/${incompleteId}/finalize`, mihhail).send({ version: incomplete.body.document.version }).expect(422);
  assert.equal((await db.getFinancialDocument(incompleteId)).data.items[0].unitPrice, "");
  const ids = [randomUUID(), randomUUID()];
  const docs = await Promise.all(
    ids.map((id) =>
      authorized("post", "").send({ id, kind: "invoice", data }).expect(201),
    ),
  );
  assert.notEqual(docs[0].body.document.number, docs[1].body.document.number);
  const id = ids[0];
  let doc = docs[0].body.document;
  await authorized("post", "").send({ id, kind: "quotation", data }).expect(409);
  await authorized("post", "").send({ id, kind: "invoice", data: { ...data, customer: "Different" } }).expect(409);
  assert.equal(
    (
      await authorized("post", "")
        .send({ id, kind: "invoice", data })
        .expect(201)
    ).body.document.number,
    doc.number,
  );
  await authorized("post", "", mihhail)
    .send({ id, kind: "invoice", data })
    .expect(409);
  await authorized("get", `/${id}`, other).expect(403);
  await authorized("get", `/${id}/pdf`, other).expect(403);
  await authorized("patch", `/${id}`, mihhail)
    .send({ version: doc.version, data: { ...data, project: "Muudetud" } })
    .expect(200);
  await authorized("patch", `/${id}`)
    .send({ version: doc.version, data })
    .expect(409);
  doc = (await authorized("get", `/${id}`)).body.document;
  configuredIssuer = { ...issuer, vatRegistered: true, vatRate: 24, vatNumber: "EE123456789" };
  await authorized("post", `/${id}/finalize`).send({ version: doc.version }).expect(409);
  configuredIssuer = issuer;
  await authorized("post", `/${id}/finalize`)
    .send({ version: doc.version })
    .expect(200);
  const download = await authorized("get", `/${id}/docx`).buffer(true).parse((res, cb) => {
    const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks)));
  }).expect(200);
  const docx = download.body;
  assert.equal(docx.subarray(0, 2).toString(), "PK");
  assert.match(download.headers['content-disposition'], /Arve_.*\.docx/);
  const xml = new PizZip(docx).file('word/document.xml').asText();
  assert.match(xml, /Testklient \u00d5\u00c4\u00d6\u00dc/);
  assert.match(xml, /Leping 2026-10/);
  assert.match(xml, /1234561/);
  const pdfDownload = await authorized("get", `/${id}/pdf?download=1`).expect(200);
  await Promise.all(pendingNotifications.splice(0));
  assert.equal(pdfDownload.body.subarray(0, 5).toString(), '%PDF-');
  assert.match(pdfDownload.body.toString('latin1'), /%%EOF/);
  await authorized("patch", `/${id}`)
    .send({ version: doc.version + 1, data })
    .expect(409);
  const message = {
    recipient: "egor.stepanov@noortetugi.ee",
    subject: "Test",
    message: "Sünteetiline test",
    confirmed: true,
  };
  await authorized("post", `/${id}/send`)
    .send({ ...message, confirmed: false })
    .expect(422);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "egor.stepanov@noortetugi.ee");
  assert.equal(sent[0].cc, undefined);
  assert.deepEqual(sent[0].attachments[0].content, pdfDownload.body);
  assert.equal(sent[0].attachments[0].contentType, 'application/pdf');
  assert.match(sent[0].subject, /Kinnitatud arve/);
  assert.match(sent[0].text, /Kinnitaja: Egor/);
  await authorized("post", `/${id}/send`, mihhail).send(message).expect(409);
  await authorized("post", `/${id}/finalize`).send({version: doc.version}).expect(409);
  assert.equal(sent.length, 1);
  const stored = (await authorized("get", `/${id}`)).body;
  assert.equal(stored.document.status, "READY");
  assert.equal(stored.document.confirmation_delivery_status, "SENT");
  assert.ok(stored.history.some(h => h.action === "CONFIRMATION_SENT"));
  assert.ok(Buffer.from((await db.getFinancialDocument(id,true)).docx).equals(docx));
  const correction = await authorized("post", "")
    .send({ id: randomUUID(), kind: "invoice", data, correctionOf: id })
    .expect(201);
  assert.equal(correction.body.document.correction_of, id);
  await authorized("post", "").send({ id: randomUUID(), kind: "quotation", data, correctionOf: id }).expect(409);
  assert.equal(
    (await authorized("get", "?status=READY&search=Testklient")).body.documents
      .length,
    1,
  );
  const second = docs[1].body.document;
  smtpFailure = true;
  const failed = await authorized("post", `/${second.id}/finalize`, mihhail)
    .send({ version: second.version }).expect(200);
  assert.match(failed.body.warning, /kinnitatud/);
  assert.equal((await db.getFinancialDocument(second.id)).status, "READY");
  assert.equal((await db.getFinancialDocument(second.id)).confirmation_delivery_status, "UNCERTAIN");
  await authorized("get", `/${second.id}/docx`).expect(200);
  await Promise.all(pendingNotifications.splice(0));
  await authorized("post", `/${second.id}/send`).send(message).expect(409);
  assert.equal(sent.length, 2);
  smtpFailure = false;
  for (const user of [egor, mihhail]) {
    const quote = (await authorized("post", "", user).send({id: randomUUID(), kind: "quotation", data}).expect(201)).body.document;
    const before = sent.length;
    const results = await Promise.all([1,2].map(() => authorized("post", `/${quote.id}/finalize`, user).send({version: quote.version})));
    assert.deepEqual(results.map(r => r.status).sort(), [200,409]);
    assert.equal(sent.length, before + 1);
    assert.match(sent.at(-1).attachments[0].filename, /^Hinnapakkumine_/);
    assert.match(sent.at(-1).subject, /Kinnitatud hinnapakkumine/);
    assert.match(sent.at(-1).text, new RegExp(`Kinnitaja: ${user.name}`));
    await authorized("post", `/${quote.id}/finalize`, other).send({version: 1}).expect(403);
    await authorized("get", `/${quote.id}/docx`, other).expect(403);
  }
  // Legacy bytes are preserved and still downloadable; Word export is additive.
  const legacy = await db.createFinancialDocument({id: randomUUID(), kind:'invoice',data:validateFinancialData(data,issuer,true),issuer,actor:egor.id});
  const legacyPdf = Buffer.from('%PDF-legacy-fixture');
  await db.finalizeFinancialDocument({id:legacy.id,version:legacy.version,pdf:legacyPdf,actor:egor.id});
  assert.deepEqual((await authorized('get', `/${legacy.id}/pdf`)).body,legacyPdf);
  await authorized('get', `/${legacy.id}/docx`).expect(200);
  await Promise.all(pendingNotifications.splice(0));
  assert.ok(Buffer.from((await db.getFinancialDocument(legacy.id,true)).pdf).equals(legacyPdf));

  // An explicitly requested customer delivery still uses the stored DOCX, once.
  const beforeCustomerSend = sent.length;
  await authorized('post', `/${id}/send`).send({ ...message, recipient: 'customer@example.test' }).expect(200);
  assert.equal(sent.length, beforeCustomerSend + 1);
  assert.ok(Buffer.from(sent.at(-1).attachments[0].content).equals(docx));
  await authorized('post', `/${id}/send`).send({ ...message, recipient: 'customer@example.test' }).expect(409);
  assert.equal(sent.length, beforeCustomerSend + 1);

  // SMTP acceptance followed by a database failure must not undo confirmation or permit resend.
  const pending = (await authorized('post', '').send({id:randomUUID(),kind:'invoice',data}).expect(201)).body.document;
  const originalFinish = db.finishFinancialConfirmation;
  db.finishFinancialConfirmation = async () => { throw new Error('simulated status write failure'); };
  const beforePending = sent.length;
  const pendingResult = await authorized('post', `/${pending.id}/finalize`).send({version:pending.version}).expect(200);
  db.finishFinancialConfirmation = originalFinish;
  assert.match(pendingResult.body.warning, /staatuse salvestamine/);
  assert.equal((await db.getFinancialDocument(pending.id)).status, 'READY');
  assert.equal((await db.getFinancialDocument(pending.id)).confirmation_delivery_status, 'SENDING');
  await authorized('post', `/${pending.id}/finalize`).send({version:pending.version}).expect(409);
  assert.equal(sent.length, beforePending + 1);

  // Explicit authorization, rather than identity, controls automatic copies.
  await pool.query('INSERT INTO financial_access(user_id) VALUES($1)', [other.id]);
  for (const user of [egor, mihhail, other]) {
    const invoice = (await authorized('post', '', user).send({ id: randomUUID(), kind: 'invoice', data }).expect(201)).body.document;
    let before = sent.length;
    await authorized('post', `/${invoice.id}/finalize`, user).send({ version: invoice.version }).expect(200);
    assert.equal(sent.length, before + 1);
    assert.equal(sent.at(-1).to, 'egor.stepanov@noortetugi.ee');
    const attachment = Buffer.from(sent.at(-1).attachments[0].content);
    assert.equal(attachment.subarray(0, 5).toString(), '%PDF-');
    assert.match(sent.at(-1).subject, new RegExp(invoice.number));
    const immediate = await authorized('get', `/${invoice.id}/pdf?download=1`, user).expect(200);
    await Promise.all(pendingNotifications.splice(0));
    assert.deepEqual(immediate.body, attachment);
    assert.equal(sent.length, before + 1);

    // A later deliberate download sends once; concurrent clicks and other users share its claim.
    await pool.query("UPDATE financial_deliveries SET created_at=NOW()-INTERVAL '2 minutes' WHERE document_id=$1", [invoice.id]);
    before = sent.length;
    const downloads = await Promise.all([user, mihhail, other].map(actor => authorized('get', `/${invoice.id}/pdf?download=1`, actor).expect(200)));
    await Promise.all(pendingNotifications.splice(0));
    assert.equal(sent.length, before + 1);
    for (const result of downloads) assert.deepEqual(result.body, sent.at(-1).attachments[0].content);
    // Inline previews and HEAD requests must not send emails.
    await authorized('get', `/${invoice.id}/pdf`, user).expect(200);
    await authorized('head', `/${invoice.id}/pdf?download=1`, user).expect(200);
    assert.equal(sent.length, before + 1);
  }

  for (const failure of ['throw', 'unaccepted', 'slow']) {
    const invoice = (await authorized('post', '', mihhail).send({ id: randomUUID(), kind: 'invoice', data }).expect(201)).body.document;
    smtpFailure = failure === 'throw';
    smtpReject = failure === 'unaccepted';
    let release;
    if (failure === 'slow') smtpGate = new Promise(resolve => { release = resolve; });
    const before = sent.length;
    // The response completes even while SMTP is still waiting on the gate.
    const result = await authorized('get', `/${invoice.id}/pdf?download=1`, mihhail).expect(200);
    assert.equal(result.body.subarray(0, 5).toString(), '%PDF-');
    release?.();
    await Promise.all(pendingNotifications.splice(0));
    smtpGate = null;
    smtpFailure = smtpReject = false;
    assert.equal(sent.length, before + 1);
    assert.equal((await pool.query("SELECT status FROM financial_deliveries WHERE document_id=$1", [invoice.id])).rows[0].status,
      failure === 'slow' ? 'SENT' : 'UNCERTAIN');
    await authorized('get', `/${invoice.id}/pdf?download=1`, other).expect(200);
    await Promise.all(pendingNotifications.splice(0));
    assert.equal(sent.length, before + 1);
  }

  // Downloading the current draft and then confirming it also shares one copy.
  const draft = (await authorized('post', '').send({ id: randomUUID(), kind: 'invoice', data }).expect(201)).body.document;
  const beforeDraft = sent.length;
  await authorized('get', `/${draft.id}/pdf?download=1`).expect(200);
  await Promise.all(pendingNotifications.splice(0));
  await authorized('post', `/${draft.id}/finalize`).send({ version: draft.version }).expect(200);
  assert.equal(sent.length, beforeDraft + 1);
  await Promise.all(pendingNotifications.splice(0));

});

test("migration renames verified identities without creating users or merging conflicts", async (t) => {
  const engine = new PGlite();
  t.after(() => engine.close());
  const migrations = await loadMigrations();
  for (const m of migrations.filter((m) => m.version < "011"))
    await engine.exec(m.sql);
  await engine.query(`INSERT INTO users(id,email,name,role,created_at,updated_at,google_subject) VALUES
    ('old','egor@noortetugi.ee','Egor','admin',NOW(),NOW(),'stable'),
    ('sem','mihhail@noortetugi.ee','Mihhail Semiyanov','member',NOW(),NOW(),'sem-sub'),
    ('conflict','mihhail.semiyanov@noortetugi.ee','Conflicting record','member',NOW(),NOW(),'other-sub')`);
  await engine.exec(migrations.find((m) => m.version === "011").sql);
  const old = (await engine.query("SELECT * FROM users WHERE id='old'"))
    .rows[0];
  assert.equal(old.email, "egor.stepanov@noortetugi.ee");
  assert.equal(old.google_subject, "stable");
  assert.equal(old.role, "admin");
  assert.equal(
    (await engine.query("SELECT email FROM users WHERE id='sem'")).rows[0]
      .email,
    "mihhail@noortetugi.ee",
  );
  assert.equal(
    (await engine.query("SELECT * FROM financial_access")).rows.length,
    1,
  );
});
