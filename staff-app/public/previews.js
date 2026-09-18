import { normalizeExpense } from "./document-values.js";

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

function attachmentName(attachment) {
  return String(
    attachment?.originalName || attachment?.filename || attachment?.name || t("staff.files.attachment")
  ).trim();
}

function attachmentDownloadUrl(attachment, { inline = false } = {}) {
  const id = String(attachment?.id || "").trim();
  if (id) {
    const path = `/api/staff/attachments/${encodeURIComponent(id)}/download`;
    return inline ? `${path}?inline=1` : path;
  }
  const explicit = String(attachment?.downloadUrl || "").trim();
  if (!/^\/api\/staff\/attachments\/[^?#/]+\/download$/.test(explicit)) return "";
  return inline ? `${explicit}?inline=1` : explicit;
}

function attachmentMimeType(attachment) {
  return String(attachment?.mimeType || attachment?.type || "application/octet-stream")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
}

function attachmentSize(attachment) {
  const size = Number(attachment?.size);
  if (!Number.isFinite(size) || size <= 0) return "";
  if (size < 1024) return `${Math.round(size)} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizePreviewAttachments(value) {
  const attachments = Array.isArray(value) ? value : [];
  const seen = new Set();
  return attachments.filter((attachment) => {
    const name = attachmentName(attachment);
    if (!name) return false;
    const key = String(attachment?.id || `${name}:${attachment?.size || 0}:${attachment?.kind || "additional"}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function previewImageData(data, attachments) {
  const images = normalizePreviewAttachments(attachments)
    .filter((attachment) => attachmentMimeType(attachment).startsWith("image/"));
  const primary = images.find((attachment) => attachment.kind === "primary");
  const additional = images.filter((attachment) => attachment !== primary);
  return {
    ...data,
    _mainImagePreview: data?._mainImagePreview || (primary
      ? attachmentDownloadUrl(primary, { inline: true })
      : ""),
    // After saving, attachments include both earlier images and this upload.
    // Using just the newly selected files hid images already on the draft.
    _additionalImagePreviews: additional.some((attachment) => attachment.id)
      ? additional.map((attachment) => attachmentDownloadUrl(attachment, { inline: true })).filter(Boolean)
      : data?._additionalImagePreviews || []
  };
}

export function renderPreviewAttachments(value) {
  const attachments = normalizePreviewAttachments(value);
  if (!attachments.length) return "";
  return `
    <section class="staff-preview-files" aria-label="${escapeHtml(t("staff.files.title"))}">
      <div class="staff-section-heading">
        <div>
          <span>${escapeHtml(t("staff.files.eyebrow"))}</span>
          <h2>${escapeHtml(t("staff.files.title"))}</h2>
        </div>
      </div>
      <div class="staff-attachment-list">
        ${attachments.map((attachment) => {
          const name = attachmentName(attachment);
          const url = attachmentDownloadUrl(attachment);
          const details = [attachmentMimeType(attachment), attachmentSize(attachment)].filter(Boolean).join(" · ");
          const content = `
            <span class="staff-attachment-icon" aria-hidden="true">▧</span>
            <span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(details)}</small></span>
            ${url ? `<span aria-hidden="true">↓</span>` : ""}
          `;
          return url
            ? `<a class="staff-attachment" href="${escapeHtml(url)}" target="_blank" rel="noopener">${content}</a>`
            : `<div class="staff-attachment">${content}</div>`;
        }).join("")}
      </div>
    </section>
  `;
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
  const registrationUrl = safeExternalUrl(data.registrationUrl);
  const categoryLabel = t(`news.categories.${data.category || "initiatives"}`) || t("common.nav.news");
  const author = String(data.author || "").trim();
  const authorText = author
    ? [t("news.ui.author", { author }), data.authorRole].filter(Boolean).join(" · ")
    : t("staff.common.notProvided");
  const summary = data.summary || data.excerpt;

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
            ${summary ? `<p>${escapeHtml(summary)}</p>` : ""}
            <span class="news-article-author">${escapeHtml(authorText)}</span>
            ${data.project ? `<span class="news-article-project">${escapeHtml(data.project)}</span>` : ""}
          </div>

          <div class="news-article-hero">
            ${renderNewsImage(data)}
          </div>

          <div class="news-article-layout">
            <article class="news-article-text">
              ${content.length
                ? content.map(renderNewsParagraph).join("")
                : `<p>${escapeHtml(t("staff.news.contentEmpty"))}</p>`}
              ${registrationUrl ? `
                <a class="news-article-link" href="${escapeHtml(registrationUrl)}" target="_blank" rel="noopener noreferrer">
                  ${escapeHtml(t("news.ui.register"))}
                  <span aria-hidden="true">↗</span>
                </a>
              ` : ""}
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

function expenseFieldRows(fields) {
  return fields.map(([label, value]) => `
    <tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>
  `).join("");
}

export function renderExpensePreview(data, options = {}) {
  const { values } = normalizeExpense(data, { ...options, preview: true });
  const generalFields = [
    ["Dokumendi nr / kuupäev", values.documentNumberAndDate],
    ["Organisatsioon / registrikood", "MTÜ Noortealgatuste Tugi, 80652930"],
    ["Juriidiline aadress", "Maleva tn 35-32, Ahtme linnaosa, Kohtla-Järve linn, Ida-Viru maakond, 31025"],
    ["Dokument esitatakse", "Egor Stepanov, finantsjuht / juhatuse liige, egor@noortetugi.ee"],
    ["Hüvitise saaja", values.recipientName],
    ["Roll seoses MTÜ tegevusega", values.recipientRole],
    ["Kontakt, kontoomanik ja IBAN", values.contactAccountIban],
    ["Tegevus / projekt / üritus", values.activityName],
    ["Kulu liik", values.expenseType],
    ["Koht, periood ja marsruut", values.locationPeriodRoute],
    ["Rahastusallikas / eelarverida", values.fundingSource]
  ];
  const activityFields = [
    ["Kus ja millal?", values.whereWhen],
    ["Mida tegid ja mis rollis?", values.activitiesAndRole],
    ["Miks oli see MTÜ jaoks vajalik?", values.necessity],
    ["Mis tulemus saadi?", values.result],
    ["Osalejad / kasusaajad", values.participants]
  ];

  return `
    <article class="staff-document staff-document--expense" lang="et">
      <section class="staff-expense-page">
        <div class="staff-expense-running-header">Kulude hüvitamise avaldus / kuluaruanne</div>
        <header class="staff-expense-title">
          <h2>KULUDE HÜVITAMISE AVALDUS JA KULUARUANNE</h2>
          <p>MTÜ põhikirjalise tegevusega seotud dokumentaalselt tõendatud kulude hüvitamine</p>
        </header>
        <section class="staff-expense-section">
          <h3>1. Üldandmed</h3>
          <table class="staff-expense-table staff-expense-fields"><tbody>${expenseFieldRows(generalFields)}</tbody></table>
        </section>
        <section class="staff-expense-section">
          <h3>2. Tegevuse sisu, vajalikkus ja tulemus</h3>
          <table class="staff-expense-table staff-expense-fields staff-expense-activity"><tbody>${expenseFieldRows(activityFields)}</tbody></table>
        </section>
        <footer class="staff-expense-page-number">Eelvaate osa 1 / 2</footer>
      </section>
      <section class="staff-expense-page">
        <header class="staff-expense-title">
          <h2>HÜVITATAVA KULU ARVESTUS</h2>
          <p>Üks rida iga kuludokumendi või selgelt eristatava kuluosa kohta</p>
        </header>
        <div class="staff-expense-table-scroll" role="region" aria-label="Hüvitatava kulu arvestus" tabindex="0">
          <table class="staff-expense-table staff-expense-costs">
            <colgroup><col style="width:28%"><col style="width:14%"><col style="width:13%"><col style="width:16%"><col style="width:14%"><col style="width:15%"></colgroup>
            <thead><tr>
              <th scope="col">Kulu kirjeldus</th>
              <th scope="col">Kulu kuupäev / tegevuse kuupäev</th>
              <th scope="col">Alusdokumendi nr / fail</th>
              <th scope="col">Kogukulu (valuuta / EUR)</th>
              <th scope="col">Taotletav summa (€)</th>
              <th scope="col">Varem hüvitatud / mittehüvitatav (€)</th>
            </tr></thead>
            <tbody>${values.items.length ? values.items.map((item) => `
              <tr>
                <td>${escapeHtml(item.description)}</td><td>${escapeHtml(item.date)}</td>
                <td>${escapeHtml(item.documentReference)}</td><td>${escapeHtml(item.grossAmount)}</td>
                <td>${escapeHtml(item.requestedAmount)}</td><td>${escapeHtml(item.excludedAmount)}</td>
              </tr>`).join("") : '<tr><td colspan="6">—</td></tr>'}</tbody>
            <tfoot><tr><th scope="row">KOKKU</th><td></td><td></td>
              <td>${escapeHtml(values.grossTotal)}</td><td>${escapeHtml(values.requestedTotal)}</td><td>${escapeHtml(values.excludedTotal)}</td>
            </tr></tfoot>
          </table>
        </div>
        <section class="staff-expense-section">
          <h3>3. Taotlus ja hüvitise saaja kinnitused</h3>
          <p>Palun hüvitada mulle eespool nimetatud MTÜ põhikirjalise tegevusega seotud ja dokumentaalselt tõendatud kulud kokku <strong>${escapeHtml(values.requestedTotal)}</strong> arvelduskontole <strong>${escapeHtml(values.iban)}</strong>.</p>
          <ul class="staff-expense-confirmations">
            <li>Kinnitan, et tasusin taotletavad kulud ise ning need on tegelikult tekkinud.</li>
            <li>Kinnitan, et kulud tehti MTÜ Noortealgatuste Tugi kasuks, need olid MTÜ tegevuse jaoks vajalikud ning tegevuse kirjeldus ja tulemused on õiged.</li>
            <li>Kinnitan, et olen lisanud kõik nõutavad alus- ja maksedokumendid ning taotletav summa ei sisalda isiklikke kulusid, välja arvatud tabelis eraldi märgitud mittehüvitatav osa.</li>
            <li>Kinnitan, et taotletavat summat ei ole mulle hüvitatud teisest allikast ega varasema kuluhüvitise avalduse alusel.</li>
            <li>Kohustun MTÜ-d viivitamata teavitama tühistamisest, tagasimaksest või muust hilisemast hüvitisest ning tagastama topelt hüvitatud summa.</li>
            <li>Käesolev taotlus puudutab dokumentaalselt tõendatud kulu hüvitamist, mitte töötasu, teenustasu, stipendiumi ega dokumentideta päevaraha.</li>
          </ul>
        </section>
        <section class="staff-expense-section">
          <h3>4. Hüvitise saaja allkiri</h3>
          <table class="staff-expense-table staff-expense-signatures">
            <thead><tr><th scope="col">Hüvitise saaja nimi</th><th scope="col">Allkiri</th><th scope="col">Kuupäev</th></tr></thead>
            <tbody><tr><td>${escapeHtml(values.recipientName)}</td><td>${escapeHtml(values.signatureStatus)}</td><td>${escapeHtml(values.signatureDate)}</td></tr></tbody>
          </table>
        </section>
        <section class="staff-expense-section staff-expense-attachments">
          <h3>5. Lisad</h3>
          <p>Lisatud dokumendid:</p>
          <ul>${values.attachments.map((attachment) => `<li>${escapeHtml(attachment.name)}</li>`).join("")}</ul>
        </section>
        <section class="staff-expense-section">
          <h3>6. MTÜ kinnitus ja finantsjuhi allkiri</h3>
          <p>Kinnitan esitatud kuluaruande kontrollimise ja taotletud ${escapeHtml(values.requestedTotal)} hüvitamise.</p>
          <table class="staff-expense-table staff-expense-signatures">
            <thead><tr><th scope="col">Kinnitaja nimi</th><th scope="col">Amet</th><th scope="col">Allkiri</th><th scope="col">Kuupäev</th></tr></thead>
            <tbody><tr><td>${escapeHtml(values.financeApproverName)}</td><td>${escapeHtml(values.financeApproverRole)}</td><td>${escapeHtml(values.financeSignatureStatus)}</td><td>${escapeHtml(values.financeSignatureDate)}</td></tr></tbody>
          </table>
          <p class="staff-expense-signature-note">Käesolev dokument allkirjastatakse digitaalselt ning jõustub pärast viimase nõutava digitaalallkirja andmist. Allkirjastamise kuupäev ja kellaaeg tulenevad digitaalallkirja ajatemplist.</p>
        </section>
        <footer class="staff-expense-page-number">Eelvaate osa 2 / 2</footer>
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

export function renderSubmissionPreview(type, data, options = {}) {
  const attachments = normalizePreviewAttachments(options.attachments);
  let preview;
  if (type === "news") {
    preview = renderNewsPreview(previewImageData(data || {}, attachments));
  } else if (type === "expense") {
    preview = renderExpensePreview(data || {}, { ...options, attachments });
  } else if (type === "invoice") {
    preview = renderInvoicePreview(data || {});
  } else {
    preview = `<div class="staff-empty-state"><p>${escapeHtml(t("staff.preview.unsupported"))}</p></div>`;
  }
  return `${preview}${renderPreviewAttachments(attachments)}`;
}
