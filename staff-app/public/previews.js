export function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function t(key, variables = {}) {
  return window.I18N?.t(key, variables) || "";
}

export function getLocale() {
  return window.I18N?.locale() || "et-EE";
}

export function formatDate(value) {
  if (!value) {
    return t("staff.common.notProvided");
  }

  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat(getLocale(), {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

export function formatDateTime(value) {
  if (!value) {
    return t("staff.common.notProvided");
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat(getLocale(), {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function formatMoney(value, currency = "EUR") {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return t("staff.common.notProvided");
  }

  try {
    return new Intl.NumberFormat(getLocale(), {
      style: "currency",
      currency: currency || "EUR"
    }).format(amount);
  } catch (error) {
    return `${amount.toFixed(2)} ${escapeHtml(currency || "EUR")}`;
  }
}

export function statusKey(status) {
  const normalized = String(status || "draft")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `staff.status.${normalized || "draft"}`;
}

export function typeKey(type) {
  const normalized = ["news", "expense", "invoice"].includes(type)
    ? type
    : "unknown";
  return `staff.type.${normalized}`;
}

function safeImageUrl(value) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  if (text.startsWith("/")) {
    return text;
  }

  try {
    const url = new URL(text, window.location.origin);
    return ["http:", "https:", "blob:"].includes(url.protocol)
      ? url.href
      : "";
  } catch (error) {
    return "";
  }
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch (error) {
    return "";
  }
}

export function contentToParagraphs(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  }

  return String(value || "")
    .split(/\n\s*\n/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function renderNewsParagraph(paragraph, index, content) {
  const text = String(paragraph || "").trim();

  if (!text) {
    return "";
  }

  const externalUrl = safeExternalUrl(text);

  if (externalUrl) {
    const previousText = String(content[index - 1] || "").toLowerCase();
    let linkText = t("news.ui.openLink");

    if (/registreer|registration|register|регистрац/i.test(previousText)) {
      linkText = t("news.ui.registerHere");
    }

    if (/kandida|nomination|candidate|кандидат|заявк/i.test(previousText)) {
      linkText = t("news.ui.submitCandidate");
    }

    return `
      <a class="news-article-link" href="${escapeHtml(externalUrl)}" target="_blank" rel="noopener noreferrer">
        ${escapeHtml(linkText)}
        <span aria-hidden="true">↗</span>
      </a>
    `;
  }

  if (text.length <= 70 && text.endsWith(":")) {
    return `<h3 class="news-article-subheading">${escapeHtml(text.slice(0, -1))}</h3>`;
  }

  return `<p>${escapeHtml(text)}</p>`;
}

function renderNewsImage(data) {
  const image = safeImageUrl(data._mainImagePreview || data.image);
  const alt = data.imageAlt || data.title || t("news.ui.photo");

  if (!image) {
    return `
      <div class="news-article-image staff-news-image-placeholder" data-placeholder="${escapeHtml(t("news.ui.addPhoto"))}">
        <span aria-hidden="true">▧</span>
      </div>
    `;
  }

  return `
    <div
      class="news-article-image"
      data-placeholder="${escapeHtml(t("news.ui.addPhoto"))}"
      style="--news-image-position:${escapeHtml(data.imagePosition || "center center")}"
    >
      <img
        class="news-image-primary${data.imageFit === "contain" ? " news-image-contain" : ""}"
        src="${escapeHtml(image)}"
        alt="${escapeHtml(alt)}"
        width="1200"
        height="750"
      >
    </div>
  `;
}

function renderNewsGallery(data) {
  const images = Array.isArray(data._additionalImagePreviews)
    ? data._additionalImagePreviews.map(safeImageUrl).filter(Boolean)
    : [];

  if (!images.length) {
    return "";
  }

  return `
    <div class="staff-news-gallery" aria-label="${escapeHtml(t("staff.news.additionalImages"))}">
      ${images.map((image, index) => `
        <figure>
          <img src="${escapeHtml(image)}" alt="${escapeHtml(t("staff.news.additionalImageAlt", { number: index + 1 }))}">
        </figure>
      `).join("")}
    </div>
  `;
}

export function renderNewsPreview(data) {
  const content = contentToParagraphs(data.content);
  const categoryLabel = t(`news.categories.${data.category || "initiatives"}`) || t("common.nav.news");
  const author = String(data.author || "").trim();
  const authorText = author
    ? t("news.ui.author", { author })
    : t("staff.common.notProvided");

  return `
    <div class="staff-news-preview news-main">
      <div class="news-container">
        <div class="news-article-view">
          <div class="news-article-heading">
            <div class="news-card-meta">
              <span>${escapeHtml(categoryLabel)}</span>
              <time datetime="${escapeHtml(data.date || "")}">${escapeHtml(formatDate(data.date))}</time>
            </div>
            <h1>${escapeHtml(data.title || t("staff.news.untitled"))}</h1>
            <p>${escapeHtml(data.summary || data.excerpt || t("staff.common.notProvided"))}</p>
            <span class="news-article-author">${escapeHtml(authorText)}</span>
          </div>

          <div class="news-article-hero">
            ${renderNewsImage(data)}
          </div>

          <div class="news-article-layout">
            <article class="news-article-text">
              ${content.length
                ? content.map(renderNewsParagraph).join("")
                : `<p>${escapeHtml(t("staff.news.contentEmpty"))}</p>`}
              ${renderNewsGallery(data)}
            </article>

            <aside class="news-article-aside">
              <span>${escapeHtml(t("staff.preview.label"))}</span>
              <h2>${escapeHtml(t("staff.news.previewAsideTitle"))}</h2>
              <p>${escapeHtml(t("staff.news.previewAsideText"))}</p>
            </aside>
          </div>
        </div>
      </div>
    </div>
  `;
}

function valueOrEmpty(value) {
  const text = String(value ?? "").trim();
  return text || t("staff.common.notProvided");
}

function renderDocumentHeader(title, reference) {
  return `
    <header class="staff-document-header">
      <img src="/assets/logo-header.png" alt="${escapeHtml(t("staff.brand.logoAlt"))}" width="220" height="88">
      <div>
        <h2>${escapeHtml(title)}</h2>
        ${reference ? `<p>${escapeHtml(reference)}</p>` : ""}
      </div>
    </header>
  `;
}

function renderDocumentField(labelKey, value, options = {}) {
  return `
    <div class="staff-document-field${options.wide ? " staff-document-field--wide" : ""}">
      <dt>${escapeHtml(t(labelKey))}</dt>
      <dd>${options.html ? value : escapeHtml(valueOrEmpty(value))}</dd>
    </div>
  `;
}

function expenseTotal(data) {
  const items = Array.isArray(data.items) ? data.items : [];
  const itemTotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  return itemTotal || Number(data.amount) || 0;
}

export function renderExpensePreview(data) {
  const items = Array.isArray(data.items) ? data.items : [];
  const total = expenseTotal(data);

  return `
    <article class="staff-document staff-document--expense">
      ${renderDocumentHeader(t("staff.expense.documentTitle"), data.project)}

      <section class="staff-document-section">
        <h3>${escapeHtml(t("staff.expense.generalSection"))}</h3>
        <dl class="staff-document-grid">
          ${renderDocumentField("staff.expense.project", data.project)}
          ${renderDocumentField("staff.expense.person", data.person)}
          ${renderDocumentField("staff.expense.date", formatDate(data.date))}
          ${renderDocumentField("staff.expense.location", data.location)}
          ${renderDocumentField("staff.expense.activity", data.activity, { wide: true })}
          ${renderDocumentField("staff.expense.purpose", data.purpose, { wide: true })}
          ${renderDocumentField("staff.expense.result", data.result, { wide: true })}
        </dl>
      </section>

      <section class="staff-document-section">
        <h3>${escapeHtml(t("staff.expense.costSection"))}</h3>
        <div class="staff-document-table-wrap">
          <table class="staff-document-table">
            <thead>
              <tr>
                <th>${escapeHtml(t("staff.common.numberShort"))}</th>
                <th>${escapeHtml(t("staff.expense.itemDate"))}</th>
                <th>${escapeHtml(t("staff.expense.documentNumber"))}</th>
                <th>${escapeHtml(t("staff.expense.vendor"))}</th>
                <th>${escapeHtml(t("staff.expense.itemDescription"))}</th>
                <th>${escapeHtml(t("staff.common.amount"))}</th>
              </tr>
            </thead>
            <tbody>
              ${items.length ? items.map((item, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${escapeHtml(formatDate(item.date))}</td>
                  <td>${escapeHtml(valueOrEmpty(item.documentNumber))}</td>
                  <td>${escapeHtml(valueOrEmpty(item.vendor))}</td>
                  <td>${escapeHtml(valueOrEmpty(item.description))}</td>
                  <td>${escapeHtml(formatMoney(item.amount, "EUR"))}</td>
                </tr>
              `).join("") : `
                <tr><td colspan="6" class="staff-document-empty">${escapeHtml(t("staff.expense.noItems"))}</td></tr>
              `}
            </tbody>
            <tfoot>
              <tr>
                <th colspan="5">${escapeHtml(t("staff.common.total"))}</th>
                <td>${escapeHtml(formatMoney(total, "EUR"))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section class="staff-document-declaration">
        <p>${escapeHtml(t("staff.expense.declaration"))}</p>
        <div>
          <span>${escapeHtml(t("staff.expense.applicantSignature"))}</span>
          <span>${escapeHtml(formatDate(data.date))}</span>
        </div>
      </section>
    </article>
  `;
}

function invoiceItems(data) {
  return Array.isArray(data.items) ? data.items : [];
}

function invoiceLineTotal(item) {
  const explicit = Number(item.total);

  if (Number.isFinite(explicit)) {
    return explicit;
  }

  return (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
}

function invoiceTotal(data) {
  const items = invoiceItems(data);
  const sum = items.reduce((total, item) => total + invoiceLineTotal(item), 0);
  return sum || Number(data.amount) || 0;
}

export function renderInvoicePreview(data) {
  const items = invoiceItems(data);
  const currency = data.currency || "EUR";
  const total = invoiceTotal(data);

  return `
    <article class="staff-document staff-document--invoice">
      ${renderDocumentHeader(t("staff.invoice.documentTitle"), data.invoiceNumber)}

      <div class="staff-invoice-meta">
        <dl>
          ${renderDocumentField("staff.invoice.invoiceNumber", data.invoiceNumber)}
          ${renderDocumentField("staff.invoice.invoiceDate", formatDate(data.invoiceDate))}
          ${renderDocumentField("staff.invoice.dueDate", formatDate(data.dueDate))}
          ${renderDocumentField("staff.invoice.currency", currency)}
          ${renderDocumentField("staff.invoice.project", data.project, { wide: true })}
          ${renderDocumentField("staff.invoice.referenceNumber", data.referenceNumber, { wide: true })}
        </dl>
      </div>

      <div class="staff-invoice-parties">
        <section>
          <h3>${escapeHtml(t("staff.invoice.seller"))}</h3>
          <strong>${escapeHtml(t("staff.invoice.sellerName"))}</strong>
          <p>${escapeHtml(t("staff.invoice.sellerDetails"))}</p>
        </section>
        <section>
          <h3>${escapeHtml(t("staff.invoice.client"))}</h3>
          <strong>${escapeHtml(valueOrEmpty(data.client))}</strong>
          <p>${escapeHtml(t("staff.invoice.registrationCode"))}: ${escapeHtml(valueOrEmpty(data.registrationCode))}</p>
          <p>${escapeHtml(valueOrEmpty(data.address))}</p>
        </section>
      </div>

      <div class="staff-document-table-wrap">
        <table class="staff-document-table staff-invoice-table">
          <thead>
            <tr>
              <th>${escapeHtml(t("staff.common.numberShort"))}</th>
              <th>${escapeHtml(t("staff.invoice.itemDescription"))}</th>
              <th>${escapeHtml(t("staff.invoice.quantity"))}</th>
              <th>${escapeHtml(t("staff.invoice.unit"))}</th>
              <th>${escapeHtml(t("staff.invoice.unitPrice"))}</th>
              <th>${escapeHtml(t("staff.common.total"))}</th>
            </tr>
          </thead>
          <tbody>
            ${items.length ? items.map((item, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(valueOrEmpty(item.description))}</td>
                <td>${escapeHtml(valueOrEmpty(item.quantity))}</td>
                <td>${escapeHtml(valueOrEmpty(item.unit))}</td>
                <td>${escapeHtml(formatMoney(item.unitPrice, currency))}</td>
                <td>${escapeHtml(formatMoney(invoiceLineTotal(item), currency))}</td>
              </tr>
            `).join("") : `
              <tr><td colspan="6" class="staff-document-empty">${escapeHtml(t("staff.invoice.noItems"))}</td></tr>
            `}
          </tbody>
          <tfoot>
            <tr>
              <th colspan="5">${escapeHtml(t("staff.common.total"))}</th>
              <td>${escapeHtml(formatMoney(total, currency))}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="staff-invoice-payment">
        <div>
          <span>${escapeHtml(t("staff.invoice.paymentDetails"))}</span>
          <strong>${escapeHtml(t("staff.invoice.paymentDetailsValue"))}</strong>
        </div>
        <div>
          <span>${escapeHtml(t("staff.invoice.amountDue"))}</span>
          <strong>${escapeHtml(formatMoney(total, currency))}</strong>
        </div>
      </div>

      ${data.additionalInfo ? `
        <section class="staff-document-note">
          <h3>${escapeHtml(t("staff.invoice.additionalInfo"))}</h3>
          <p>${escapeHtml(data.additionalInfo)}</p>
        </section>
      ` : ""}
    </article>
  `;
}

export function renderSubmissionPreview(type, data) {
  if (type === "news") {
    return renderNewsPreview(data || {});
  }

  if (type === "expense") {
    return renderExpensePreview(data || {});
  }

  if (type === "invoice") {
    return renderInvoicePreview(data || {});
  }

  return `<div class="staff-empty-state"><p>${escapeHtml(t("staff.preview.unsupported"))}</p></div>`;
}

