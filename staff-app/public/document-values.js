// One plain-text field mapping for the expense DOCX and its browser preview.
// This module has no server dependencies and contains no private configuration.

export class DocumentValidationError extends Error {
  constructor(message, details = undefined) {
    super(message);
    this.name = "DocumentValidationError";
    this.code = "DOCUMENT_VALIDATION_ERROR";
    this.details = details;
  }
}

export function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

export function cleanText(value, { fallback = "—", maxLength = 2_000, required = false, field = "value" } = {}) {
  const source = value === undefined || value === null ? "" : String(value);
  const cleaned = source
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim();

  if (!cleaned) {
    if (required) {
      throw new DocumentValidationError(`${field} is required`, { field, reason: "required" });
    }
    return fallback;
  }

  if (cleaned.length > maxLength) {
    throw new DocumentValidationError(`${field} is too long`, { field, reason: "too_long", maxLength });
  }

  return cleaned;
}

/**
 * @param {unknown} value
 * @param {{field?: string, min?: number, max?: number, required?: boolean}} [options]
 */
export function parseDecimal(value, { field, min = 0, max = 1_000_000_000, required = true } = {}) {
  if ((value === undefined || value === null || value === "") && !required) {
    return undefined;
  }
  const normalized = typeof value === "string" ? value.replace(/\s/g, "").replace(",", ".") : value;
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new DocumentValidationError(`${field} must be a finite number between ${min} and ${max}`, {
      field,
      reason: "invalid_number",
      min,
      max,
    });
  }
  return number;
}

export function toCents(value, options) {
  return Math.round(parseDecimal(value, options) * 100);
}

export function formatMoney(cents) {
  const sign = cents < 0 ? "−" : "";
  const absolute = Math.abs(cents);
  const euros = Math.floor(absolute / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${euros},${String(absolute % 100).padStart(2, "0")} €`;
}

export function formatDate(value, { required = false, field = "date" } = {}) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getDate()).padStart(2, "0")}.${String(value.getMonth() + 1).padStart(2, "0")}.${value.getFullYear()}`;
  }
  const text = cleanText(value, { fallback: "—", required, field, maxLength: 80 });
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  return iso ? `${iso[3]}.${iso[2]}.${iso[1]}` : text;
}

export function normalizeExpense(data = {}, meta = {}) {
  const required = !meta.preview;
  const recipient = data.recipient && typeof data.recipient === "object" ? data.recipient : {};
  const configuredRecipient = meta.reimbursementRecipient &&
    typeof meta.reimbursementRecipient === "object" ? meta.reimbursementRecipient : {};
  const rawItems = firstDefined(data.items, data.expenses, meta.preview ? [] : undefined);
  if (!Array.isArray(rawItems) || (required && rawItems.length < 1) || rawItems.length > 100) {
    throw new DocumentValidationError("Expense report must contain between 1 and 100 cost items", {
      field: "items",
      reason: "invalid_item_count",
    });
  }

  const items = rawItems.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new DocumentValidationError(`Expense item ${index + 1} is invalid`, {
        field: `items[${index}]`,
        reason: "invalid_item",
      });
    }
    const grossCents = toCents(
      firstDefined(
        item.grossAmountEur,
        item.grossAmount,
        item.totalAmount,
        item.totalEUR,
        item.originalTotal,
        item.amount,
        meta.preview ? 0 : undefined
      ),
      { field: `items[${index}].grossAmount`, min: 0, max: 100_000_000 },
    );
    const requestedCents = toCents(firstDefined(
      item.requestedAmount,
      item.reimbursementAmount,
      item.requestedEUR,
      item.amount,
      grossCents / 100
    ), {
      field: `items[${index}].requestedAmount`,
      min: 0,
      max: 100_000_000,
    });
    const defaultExcluded = Math.max(0, grossCents - requestedCents) / 100;
    const schemaExcluded = Number(item.ineligibleEUR || 0) + Number(item.previouslyReimbursedEUR || 0);
    const excludedCents = toCents(
      firstDefined(
        item.excludedAmount,
        item.nonReimbursableAmount,
        item.previouslyReimbursedAmount,
        schemaExcluded > 0 ? schemaExcluded : undefined,
        defaultExcluded
      ),
      { field: `items[${index}].excludedAmount`, min: 0, max: 100_000_000 },
    );
    if (requestedCents > grossCents || requestedCents + excludedCents > grossCents) {
      throw new DocumentValidationError(
        `Expense item ${index + 1} requested and excluded amounts cannot exceed its gross amount`,
        { field: `items[${index}].amount`, reason: "amount_reconciliation" },
      );
    }

    const currency = cleanText(firstDefined(item.currency, "EUR"), {
      field: `items[${index}].currency`,
      maxLength: 3,
    }).toUpperCase();
    let grossAmount = formatMoney(grossCents);
    if (currency !== "EUR") {
      const originalAmount = parseDecimal(firstDefined(item.originalAmount, item.originalTotal), {
        field: `items[${index}].originalAmount`,
        min: 0,
        max: 1_000_000_000,
      });
      const originalText = new Intl.NumberFormat("et-EE", { maximumFractionDigits: 2 }).format(originalAmount);
      grossAmount = `${originalText} ${currency} / ${formatMoney(grossCents)}`;
    }

    const combinedDescription = [item.vendor || item.provider, item.description]
      .map((entry) => String(entry || "").trim())
      .filter((entry, position, entries) => entry && entries.indexOf(entry) === position)
      .join(" — ");

    return {
      description: cleanText(firstDefined(combinedDescription, item.description, item.vendor), {
        required,
        field: `items[${index}].description`,
        maxLength: 750,
      }),
      date: formatDate(firstDefined(item.date, item.expenseDate, item.period), {
        required,
        field: `items[${index}].date`,
      }),
      documentReference: cleanText(firstDefined(
        item.documentReference,
        item.sourceDocumentNumber,
        item.sourceDocument,
        item.documentNumber,
        item.fileName
      ), {
        required,
        field: `items[${index}].documentReference`,
        maxLength: 250,
      }),
      grossAmount,
      requestedAmount: formatMoney(requestedCents),
      excludedAmount: formatMoney(excludedCents),
      grossCents,
      requestedCents,
      excludedCents,
    };
  });

  const grossTotalCents = items.reduce((sum, item) => sum + item.grossCents, 0);
  const requestedTotalCents = items.reduce((sum, item) => sum + item.requestedCents, 0);
  const excludedTotalCents = items.reduce((sum, item) => sum + item.excludedCents, 0);
  const recipientName = cleanText(firstDefined(
    configuredRecipient.name,
    recipient.name,
    data.recipientName,
    data.claimantName,
    data.person
  ), {
    required,
    field: "recipient.name",
    maxLength: 250,
  });
  const rawIban = firstDefined(recipient.iban, data.iban);
  const iban = cleanText(rawIban, {
    fallback: "—",
    field: "recipient.iban",
    maxLength: 80,
  }).toUpperCase();
  const generatedDocumentNumber = meta.submission?.id
    ? `KA-${String(meta.submission.id).slice(0, 8).toUpperCase()}`
    : undefined;
  const documentNumber = cleanText(
    firstDefined(data.documentNumber, data.number, generatedDocumentNumber),
    { fallback: "—", field: "documentNumber", maxLength: 100 }
  );
  const documentDate = formatDate(firstDefined(data.documentDate, data.date), {
    required,
    field: "documentDate",
  });

  const contactParts = [
    firstDefined(configuredRecipient.email, recipient.email, data.email),
    firstDefined(recipient.phone, data.phone),
    firstDefined(recipient.accountHolder, data.accountHolder)
      ? `Kontoomanik: ${cleanText(firstDefined(recipient.accountHolder, data.accountHolder), { maxLength: 250 })}`
      : undefined,
    rawIban ? `IBAN: ${iban}` : undefined,
  ].filter(Boolean);

  const rawAttachments = firstDefined(data.attachments, meta.attachments, []);
  if (!Array.isArray(rawAttachments) || rawAttachments.length > 100) {
    throw new DocumentValidationError("attachments must be an array with at most 100 entries", {
      field: "attachments",
      reason: "invalid_attachment_count",
    });
  }
  const attachments = rawAttachments.map((attachment, index) => ({
    name: cleanText(
      typeof attachment === "string"
        ? attachment
        : firstDefined(attachment?.originalName, attachment?.fileName, attachment?.name),
      { required, field: `attachments[${index}].name`, maxLength: 255 },
    ),
  }));
  if (attachments.length === 0) {
    attachments.push({ name: "Lisad puuduvad" });
  }

  return {
    values: {
      documentNumberAndDate: `${documentNumber} / ${documentDate}`,
      recipientName,
      recipientRole: cleanText(firstDefined(recipient.role, data.recipientRole, data.claimantRole, data.role), {
        field: "recipient.role",
        maxLength: 200,
      }),
      contactAccountIban: cleanText(firstDefined(data.contactAccountIban, contactParts.join("; ")), {
        field: "contactAccountIban",
        maxLength: 700,
      }),
      activityName: cleanText(firstDefined(data.project, data.activityName, data.activity, data.projectName), {
        required,
        field: "activityName",
        maxLength: 500,
      }),
      expenseType: cleanText(firstDefined(data.expenseType, data.costType, data.expenseCategory), {
        field: "expenseType",
        maxLength: 300,
      }),
      locationPeriodRoute: cleanText(firstDefined(
        data.locationPeriodRoute,
        data.locationAndPeriod,
        [data.location, data.period, data.route].filter(Boolean).join(" — ")
      ), {
        field: "locationPeriodRoute",
        maxLength: 1_250,
      }),
      fundingSource: cleanText(firstDefined(data.fundingSource, data.budgetLine), {
        field: "fundingSource",
        maxLength: 300,
      }),
      whereWhen: cleanText(firstDefined(
        data.whereWhen,
        data.locationAndDates,
        [data.date ? formatDate(data.date) : undefined, data.location].filter(Boolean).join(" — ")
      ), {
        required,
        field: "whereWhen",
        maxLength: 2_000,
      }),
      activitiesAndRole: cleanText(firstDefined(
        data.activitiesAndRole,
        data.activities,
        data.activityDescription,
        data.activity
      ), {
        required,
        field: "activitiesAndRole",
        maxLength: 4_000,
      }),
      necessity: cleanText(firstDefined(data.necessity, data.whyNecessary, data.goal, data.purpose), {
        required,
        field: "necessity",
        maxLength: 4_000,
      }),
      result: cleanText(firstDefined(data.result, data.outcome), {
        required,
        field: "result",
        maxLength: 4_000,
      }),
      participants: cleanText(firstDefined(data.participants, data.beneficiaries), {
        field: "participants",
        maxLength: 2_000,
      }),
      items: items.map(({ grossCents: _grossCents, requestedCents: _requestedCents, excludedCents: _excludedCents, ...item }) => item),
      grossTotal: formatMoney(grossTotalCents),
      requestedTotal: formatMoney(requestedTotalCents),
      excludedTotal: formatMoney(excludedTotalCents),
      iban,
      signatureStatus: cleanText(firstDefined(data.signatureStatus, meta.signatureStatus), {
        fallback: "Allkirjastatakse digitaalselt",
        field: "signatureStatus",
        maxLength: 100,
      }),
      signatureDate: firstDefined(data.signatureDate, meta.signatureDate)
        ? formatDate(firstDefined(data.signatureDate, meta.signatureDate), { field: "signatureDate" })
        : "Digitaalallkirja ajatempel",
      // The supplied official template names this officer. These labels describe
      // the external signing step; generating a report does not sign or approve it.
      financeApproverName: "Egor Stepanov",
      financeApproverRole: "finantsjuht",
      financeSignatureStatus: "Allkirjastatakse digitaalselt",
      financeSignatureDate: "Digitaalallkirja ajatempel",
      attachments,
    },
    documentNumber,
  };
}

