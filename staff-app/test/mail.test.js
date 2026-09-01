import assert from "node:assert/strict";
import test from "node:test";

import { createMailService } from "../src/mail.js";

function mailConfig(overrides = {}) {
  return {
    smtpHost: "smtp.example.test",
    smtpPort: 587,
    smtpSecure: false,
    smtpRequireTls: true,
    smtpUser: "",
    smtpPassword: "",
    mailConnectionTimeoutMs: 5_000,
    mailFrom: "Noorte Tugi <staff@example.test>",
    financeNotificationEmail: "egor@noortetugi.ee",
    ...overrides,
  };
}

function expenseSubmission(overrides = {}) {
  return {
    id: "9f71c168-43d7-4c51-aa5f-e4b6384db777",
    creatorName: "Mari Maasikas",
    creatorEmail: "mari@noortetugi.ee",
    revision: 3,
    updatedAt: "2026-08-30T10:14:00.000Z",
    submittedAt: "2026-08-30T10:15:00.000Z",
    data: {
      project: "Noorte arengupäev",
      date: "2026-08-29",
      amount: 42.5,
    },
    ...overrides,
  };
}

function expenseAttachments() {
  return [
    {
      filename: "kuluaruanne-KA-TEST.docx",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      content: Buffer.from("generated-docx"),
    },
    {
      filename: "tsekk.pdf",
      contentType: "application/pdf",
      content: Buffer.from("%PDF-1.7 test attachment"),
    },
  ];
}

test("mail service reports unavailable configuration without creating a transport", async () => {
  const service = createMailService({
    smtpHost: "",
    mailFrom: "",
    financeNotificationEmail: "",
  });

  assert.equal(service.available, false);
  await assert.rejects(
    () => service.sendExpenseSubmitted({ submission: expenseSubmission(), reviewUrl: "https://staff.example.test/admin" }),
    (error) => error?.code === "MAIL_NOT_CONFIGURED",
  );
});

test("mail service sends a plain-text expense summary to the configured finance recipient", async () => {
  const sent = [];
  const transport = {
    async sendMail(message) {
      sent.push(message);
      return { messageId: "test-message" };
    },
  };
  const service = createMailService(mailConfig(), { transport });

  assert.equal(service.available, true);
  await service.sendExpenseSubmitted({
    submission: expenseSubmission(),
    reviewUrl: "https://staff.example.test/admin?submission=9f71c168-43d7-4c51-aa5f-e4b6384db777",
    attachments: expenseAttachments(),
  });

  assert.equal(sent.length, 1);
  const [message] = sent;
  assert.equal(message.from, "Noorte Tugi <staff@example.test>");
  assert.equal(message.to, "egor@noortetugi.ee");
  assert.equal(
    message.messageId,
    "<expense-9f71c168-43d7-4c51-aa5f-e4b6384db777-r3-1788084840000@noortetugi.ee>",
  );
  assert.equal(message.html, undefined);
  assert.equal(message.attachments.length, 2);
  assert.deepEqual(
    message.attachments.map(({ filename, contentType, content }) => ({ filename, contentType, size: content.length })),
    [
      {
        filename: "kuluaruanne-KA-TEST.docx",
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: 14,
      },
      { filename: "tsekk.pdf", contentType: "application/pdf", size: 24 },
    ],
  );
  assert.match(message.subject, /Mari Maasikas/);
  assert.match(message.subject, /Noorte arengupäev/);
  assert.match(message.text, /Esitaja: Mari Maasikas/);
  assert.match(message.text, /Projekt: Noorte arengupäev/);
  assert.match(message.text, /42,50\s*€/u);
  assert.match(message.text, /9f71c168-43d7-4c51-aa5f-e4b6384db777/);
  assert.match(message.text, /https:\/\/staff\.example\.test\/admin\?submission=/);
  assert.match(message.text, /Manuseid: 2/);
});

test("mail subject strips header injection and recipient cannot be overridden by submission data", async () => {
  const sent = [];
  const transport = { sendMail: async (message) => sent.push(message) };
  const service = createMailService(mailConfig(), { transport });

  await service.sendExpenseSubmitted({
    submission: expenseSubmission({
      creatorName: "Mari\r\nBcc: attacker@example.test",
      data: {
        project: "Projekt\r\nCc: attacker@example.test",
        date: "2026-08-29",
        amount: 10,
        email: "attacker@example.test",
      },
    }),
    reviewUrl: "https://staff.example.test/admin?submission=safe-id",
    attachments: expenseAttachments(),
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "egor@noortetugi.ee");
  assert.equal(/[\r\n]/.test(sent[0].subject), false);
  assert.equal(sent[0].attachments.length, 2);
});

test("mail transport failures are propagated to the asynchronous notification caller", async () => {
  const providerError = Object.assign(new Error("provider unavailable"), { code: "ETIMEDOUT" });
  const transport = {
    async sendMail() {
      throw providerError;
    },
  };
  const service = createMailService(mailConfig(), { transport });

  await assert.rejects(
    () => service.sendExpenseSubmitted({
      submission: expenseSubmission(),
      reviewUrl: "https://staff.example.test/admin?submission=safe-id",
      attachments: expenseAttachments(),
    }),
    (error) => error === providerError,
  );
});

test("mail service rejects empty generated or uploaded attachments", async () => {
  const service = createMailService(mailConfig(), {
    transport: { async sendMail() {} },
  });
  await assert.rejects(
    () => service.sendExpenseSubmitted({
      submission: expenseSubmission(),
      reviewUrl: "https://staff.example.test/admin?submission=safe-id",
      attachments: [{
        filename: "empty.pdf",
        contentType: "application/pdf",
        content: Buffer.alloc(0),
      }],
    }),
    (error) => error?.code === "MAIL_ATTACHMENT_INVALID",
  );
});
