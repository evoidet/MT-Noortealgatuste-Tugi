import nodemailer from "nodemailer";

function cleanHeader(value, fallback = "") {
  return String(value ?? fallback)
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function cleanLine(value, fallback = "—") {
  const normalized = String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, 1_000);
  return normalized || fallback;
}

function formatAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("et-EE", {
    style: "currency",
    currency: "EUR"
  }).format(amount);
}

function mailUnavailableError() {
  const error = new Error("Expense notification email is not configured.");
  error.code = "MAIL_NOT_CONFIGURED";
  return error;
}

function mailAttachmentError() {
  const error = new Error("Expense notification attachments are invalid.");
  error.code = "MAIL_ATTACHMENT_INVALID";
  return error;
}

function normalizedAttachments(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 101) {
    throw mailAttachmentError();
  }
  return value.map((attachment) => {
    const filename = cleanHeader(attachment?.filename);
    const contentType = cleanHeader(attachment?.contentType, "application/octet-stream");
    const content = Buffer.isBuffer(attachment?.content) || typeof attachment?.content === "string"
      ? attachment.content
      : attachment?.content instanceof Uint8Array
        ? Buffer.from(attachment.content)
        : null;
    if (!filename || !content || !contentType || Buffer.byteLength(content) === 0) {
      throw mailAttachmentError();
    }
    return { filename, content, contentType };
  });
}

function expenseMessageId(submission, recipient) {
  const id = String(submission?.id || "submission").replace(/[^a-z0-9-]/gi, "-").slice(0, 80);
  const revision = Number.isSafeInteger(Number(submission?.revision)) ? Number(submission.revision) : 0;
  const updated = new Date(submission?.updatedAt || 0).getTime();
  const timestamp = Number.isFinite(updated) && updated > 0 ? updated : 0;
  const domain = String(recipient || "").split("@").at(-1)?.toLowerCase() || "noortetugi.ee";
  return `<expense-${id}-r${revision}-${timestamp}@${domain}>`;
}

export function createMailService(config, overrides = {}) {
  const configured = Boolean(config.smtpHost && config.mailFrom && config.financeNotificationEmail);
  const createTransport = overrides.createTransport ?? ((options) => nodemailer.createTransport(options));
  const transport = overrides.transport ?? (configured
    ? createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        requireTLS: config.smtpRequireTls,
        auth: config.smtpUser
          ? { user: config.smtpUser, pass: config.smtpPassword }
          : undefined,
        connectionTimeout: config.mailConnectionTimeoutMs,
        greetingTimeout: config.mailConnectionTimeoutMs,
        socketTimeout: Math.max(config.mailConnectionTimeoutMs * 2, 20_000),
        logger: false,
        debug: false
      })
    : null);

  return Object.freeze({
    available: Boolean(transport && config.mailFrom && config.financeNotificationEmail),

    async sendExpenseSubmitted({ submission, reviewUrl, attachments }) {
      if (!transport || !config.mailFrom || !config.financeNotificationEmail) {
        throw mailUnavailableError();
      }

      const data = submission?.data ?? {};
      const submitter = cleanHeader(submission?.creatorName || submission?.creatorEmail, "Töötaja");
      const project = cleanHeader(data.project, "Projekt puudub");
      const subject = `Uus kuluaruanne — ${submitter} — ${project}`;
      const submittedAt = cleanLine(submission?.submittedAt || submission?.updatedAt);
      const mailAttachments = normalizedAttachments(attachments);

      return transport.sendMail({
        from: config.mailFrom,
        to: config.financeNotificationEmail,
        messageId: expenseMessageId(submission, config.financeNotificationEmail),
        subject,
        disableFileAccess: true,
        disableUrlAccess: true,
        text: [
          "Uus kuluaruanne ootab kontrollimist.",
          "",
          `Esitaja: ${cleanLine(submission?.creatorName || submission?.creatorEmail)}`,
          `Projekt: ${cleanLine(data.project)}`,
          `Kuupäev: ${cleanLine(data.date)}`,
          `Summa: ${formatAmount(data.amount)}`,
          `Esitamise ID: ${cleanLine(submission?.id)}`,
          `Esitamise aeg: ${submittedAt}`,
          `Turvaline kontrollimise link: ${cleanLine(reviewUrl)}`,
          "",
          "Link nõuab Google Workspace'i sisselogimist ja finants- või administraatoriõigust.",
          `Manuseid: ${mailAttachments.length}`
        ].join("\n"),
        attachments: mailAttachments
      });
    }
  });
}

export const __mailTestUtils = Object.freeze({
  cleanHeader,
  cleanLine,
  expenseMessageId,
  formatAmount,
  normalizedAttachments
});
