import { api, ApiError, setCsrfToken } from "./api.js";
import {
  contentToParagraphs,
  escapeHtml,
  formatDateTime,
  formatMoney,
  renderSubmissionPreview,
  statusKey,
  t,
  typeKey
} from "./previews.js";

const state = {
  session: null,
  view: "boot",
  listScope: "mine",
  listType: "",
  current: null,
  formType: null,
  editingId: null,
  preview: null,
  pendingFiles: new Map(),
  uploadedFiles: new Set(),
  objectUrls: [],
  ai: {
    target: null,
    field: "",
    suggestion: ""
  },
  review: {
    submissionId: null,
    decision: ""
  },
  lastSubmitted: null
};

const elements = {
  app: document.getElementById("staffApp"),
  boot: document.getElementById("bootView"),
  login: document.getElementById("loginView"),
  denied: document.getElementById("deniedView"),
  deniedMessage: document.getElementById("deniedMessage"),
  shell: document.getElementById("authenticatedShell"),
  loginButton: document.getElementById("loginButton"),
  deniedRetryButton: document.getElementById("deniedRetryButton"),
  viewRoot: document.getElementById("viewRoot"),
  main: document.getElementById("staffMain"),
  userName: document.getElementById("userName"),
  userEmail: document.getElementById("userEmail"),
  userRole: document.getElementById("userRole"),
  userInitial: document.getElementById("userInitial"),
  userMenu: document.getElementById("userMenu"),
  userMenuButton: document.getElementById("userMenuButton"),
  logoutButton: document.getElementById("logoutButton"),
  aiDialog: document.getElementById("aiDialog"),
  aiMode: document.getElementById("aiMode"),
  aiOriginal: document.getElementById("aiOriginal"),
  aiSuggestion: document.getElementById("aiSuggestion"),
  aiGenerateButton: document.getElementById("aiGenerateButton"),
  aiUseButton: document.getElementById("aiUseButton"),
  reviewDialog: document.getElementById("reviewDialog"),
  reviewDecisionDescription: document.getElementById("reviewDecisionDescription"),
  reviewComment: document.getElementById("reviewComment"),
  reviewCommentHint: document.getElementById("reviewCommentHint"),
  reviewConfirmButton: document.getElementById("reviewConfirmButton"),
  toastRegion: document.getElementById("toastRegion")
};

function applyTranslations(root = document) {
  window.I18N?.apply(root);
  document.title = t("staff.meta.title");
}

function showOnly(view) {
  elements.boot.hidden = view !== "boot";
  elements.login.hidden = view !== "login";
  elements.denied.hidden = view !== "denied";
  elements.shell.hidden = view !== "shell";
}

function safeLoginUrl(value) {
  try {
    const url = new URL(value || "/api/staff/auth/google", window.location.origin);
    const allowedExternal = url.protocol === "https:" && url.hostname === "accounts.google.com";
    return url.origin === window.location.origin || allowedExternal
      ? url.href
      : "/api/staff/auth/google";
  } catch (error) {
    return "/api/staff/auth/google";
  }
}

function loginUrlForCurrentPage(value) {
  const url = new URL(safeLoginUrl(value));
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (url.origin === window.location.origin && returnTo.startsWith("/admin")) {
    url.searchParams.set("returnTo", returnTo);
  }
  return url.href;
}

function normalizePermissions() {
  return new Set(
    (Array.isArray(state.session?.permissions) ? state.session.permissions : [])
      .map((permission) => String(permission || "").trim().toLowerCase())
      .filter(Boolean)
  );
}

function role() {
  return String(state.session?.user?.role || "member").toLowerCase();
}

function hasAnyPermission(...names) {
  const permissions = normalizePermissions();
  return names.some((name) => permissions.has(name.toLowerCase()));
}

function canCreate(type) {
  const currentRole = role();

  if (type === "news") {
    return hasAnyPermission("news:create", "create:news", "submissions:create:news") ||
      ["editor", "admin"].includes(currentRole);
  }

  if (type === "expense") {
    return hasAnyPermission("expense:create", "create:expense", "submissions:create:expense") ||
      ["member", "editor", "finance", "admin"].includes(currentRole);
  }

  if (type === "invoice") {
    return hasAnyPermission("invoice:create", "create:invoice", "submissions:create:invoice") ||
      ["finance", "admin"].includes(currentRole);
  }

  return false;
}

function canReview() {
  return hasAnyPermission(
    "review:read",
    "submissions:review",
    "news:review",
    "expense:review",
    "invoice:review"
  ) || ["finance", "admin"].includes(role());
}

function canReviewType(type) {
  return hasAnyPermission(`${type}:review`);
}

function canAudit() {
  return hasAnyPermission("audit:read", "admin:audit") || role() === "admin";
}

function templateAvailable(type) {
  const availability = state.session?.documentTemplates;
  return !availability || availability[type] !== false;
}

function availableTypes(scope) {
  const types = ["news", "expense", "invoice"];
  return scope === "review"
    ? types.filter(canReviewType)
    : types.filter(canCreate);
}

function configureAuthenticatedShell() {
  const user = state.session.user || {};
  const displayName = user.name || user.email || t("staff.header.unknownUser");
  elements.userName.textContent = displayName;
  elements.userEmail.textContent = user.email || "";
  elements.userRole.textContent = t(`staff.role.${role()}`);
  elements.userInitial.textContent = displayName.trim().charAt(0).toLocaleUpperCase() || "•";

  document.querySelectorAll('[data-requires="review"]').forEach((element) => {
    element.hidden = !canReview();
  });

  document.querySelectorAll('[data-requires="audit"]').forEach((element) => {
    element.hidden = !canAudit();
  });

  void refreshReviewBadge();
}

function friendlyErrorKey(error) {
  if (!(error instanceof ApiError)) {
    return "staff.errors.unexpected";
  }

  const code = error.payload?.error || error.message;
  const codeKeys = {
    PRIMARY_ATTACHMENT_REQUIRED: "staff.errors.primaryAttachmentRequired",
    DOCUMENT_TEMPLATE_UNAVAILABLE: "staff.errors.templateUnavailable",
    DOCUMENT_VALIDATION_ERROR: "staff.errors.documentValidation",
    SELF_REVIEW_FORBIDDEN: "staff.errors.selfReview"
  };
  if (codeKeys[code]) return codeKeys[code];
  if (error.status === 0) return "staff.errors.network";
  if (error.status === 400 || error.status === 422) return "staff.errors.validation";
  if (error.status === 401) return "staff.errors.sessionExpired";
  if (error.status === 403) return "staff.errors.forbidden";
  if (error.status === 404) return "staff.errors.notFound";
  if (error.status === 409) return "staff.errors.conflict";
  if (error.status === 413) return "staff.errors.fileTooLarge";
  if (error.status === 415) return "staff.errors.fileType";
  if (error.status === 429) return "staff.errors.rateLimit";
  return "staff.errors.unexpected";
}

function showToast(key, tone = "info", variables = {}) {
  const toast = document.createElement("div");
  toast.className = `staff-toast staff-toast--${tone}`;
  toast.setAttribute("role", tone === "error" ? "alert" : "status");
  toast.textContent = t(key, variables);
  elements.toastRegion.append(toast);

  window.setTimeout(() => {
    toast.classList.add("is-leaving");
    window.setTimeout(() => toast.remove(), 220);
  }, 4200);
}

function handleError(error, options = {}) {
  if (error instanceof ApiError && error.status === 401 && options.allowSessionReset !== false) {
    void loadSession();
    return;
  }

  showToast(friendlyErrorKey(error), "error");
}

function setBusy(button, busy, key = "staff.common.working") {
  if (!button) return;

  if (busy) {
    button.dataset.previousHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="staff-button-spinner" aria-hidden="true"></span><span>${escapeHtml(t(key))}</span>`;
  } else {
    button.disabled = false;

    if (button.dataset.previousHtml) {
      button.innerHTML = button.dataset.previousHtml;
      delete button.dataset.previousHtml;
    }
  }
}

function pageHeader({ eyebrow, title, description = "", backView = "" }) {
  return `
    <header class="staff-view-header">
      <div class="staff-view-heading">
        ${backView ? `
          <button class="staff-back-button" type="button" data-action="navigate" data-view="${escapeHtml(backView)}">
            <span aria-hidden="true">←</span>
            <span>${escapeHtml(t("staff.common.back"))}</span>
          </button>
        ` : ""}
        <span class="staff-eyebrow">${escapeHtml(t(eyebrow))}</span>
        <h1>${escapeHtml(t(title))}</h1>
        ${description ? `<p>${escapeHtml(t(description))}</p>` : ""}
      </div>
    </header>
  `;
}

function renderLoading(key = "staff.common.loading") {
  elements.viewRoot.innerHTML = `
    <div class="staff-inline-loading" role="status">
      <span class="staff-loader" aria-hidden="true"></span>
      <p>${escapeHtml(t(key))}</p>
    </div>
  `;
}

function setActiveNavigation(view) {
  const navView = ["form", "preview", "detail"].includes(view) ? "mine" : view;

  document.querySelectorAll("[data-action='navigate'][data-view]").forEach((button) => {
    const active = button.dataset.view === navView;
    button.classList.toggle("is-active", active);

    if (active) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });
}

function focusMain() {
  window.requestAnimationFrame(() => elements.main?.focus({ preventScroll: true }));
}

async function loadSession() {
  showOnly("boot");
  state.view = "boot";

  try {
    const session = await api.session();

    if (!session?.authenticated) {
      const authError = new URLSearchParams(window.location.search).get("auth");
      if (["denied", "failed", "expired", "unavailable"].includes(authError)) {
        state.session = null;
        setCsrfToken("");
        showOnly("denied");
        state.view = "denied";
        elements.deniedMessage.textContent = t(`staff.auth.${authError}`);
        return;
      }
      state.session = null;
      setCsrfToken("");
      elements.loginButton.href = loginUrlForCurrentPage(session?.loginUrl);
      showOnly("login");
      state.view = "login";
      applyTranslations(elements.login);
      return;
    }

    if (!session.user?.email) {
      showOnly("denied");
      state.view = "denied";
      return;
    }

    state.session = session;
    setCsrfToken(session.csrfToken);
    configureAuthenticatedShell();
    showOnly("shell");
    const params = new URLSearchParams(window.location.search);
    const submissionId = params.get("submission");
    const requestedScope = params.get("scope") === "review" ? "review" : "mine";
    if (submissionId && (requestedScope !== "review" || canReview())) {
      await navigate("detail", { id: submissionId, scope: requestedScope });
    } else {
      await navigate("home");
    }
  } catch (error) {
    showOnly("denied");
    state.view = "denied";
    elements.deniedMessage.textContent = t(friendlyErrorKey(error));
  }
}

function releaseObjectUrls() {
  state.objectUrls.forEach((url) => URL.revokeObjectURL(url));
  state.objectUrls = [];
}

function resetFormState() {
  releaseObjectUrls();
  state.pendingFiles = new Map();
  state.uploadedFiles = new Set();
  state.formType = null;
  state.editingId = null;
  state.preview = null;
  state.lastSubmitted = null;
}

async function navigate(view, options = {}) {
  elements.userMenu.hidden = true;
  elements.userMenuButton.setAttribute("aria-expanded", "false");

  if (!["form", "preview", "detail"].includes(view) && options.keepFormState !== true) {
    resetFormState();
  }

  if (view === "review" && !canReview()) {
    showToast("staff.errors.forbidden", "error");
    return;
  }

  if (view === "audit" && !canAudit()) {
    showToast("staff.errors.forbidden", "error");
    return;
  }

  state.view = view;
  setActiveNavigation(view);

  if (view === "home") {
    renderHome();
  } else if (view === "mine") {
    await renderList("mine", options.type || "");
  } else if (view === "review") {
    await renderList("review", options.type || "");
  } else if (view === "audit") {
    await renderAudit();
  } else if (view === "detail" && options.id) {
    await renderDetail(options.id, options.scope || "mine");
  }

  focusMain();
}

function homeCard({ type, icon, title, text }) {
  if (!canCreate(type)) return "";

  return `
    <button class="staff-action-card staff-action-card--${escapeHtml(type)}" type="button" data-action="start-form" data-type="${escapeHtml(type)}">
      <span class="staff-action-icon" aria-hidden="true">${icon}</span>
      <span class="staff-action-copy">
        <strong>${escapeHtml(t(title))}</strong>
        <small>${escapeHtml(t(text))}</small>
      </span>
      <span class="staff-action-arrow" aria-hidden="true">→</span>
    </button>
  `;
}

function renderHome() {
  const firstName = String(state.session?.user?.name || "").trim().split(/\s+/)[0] || "";
  elements.viewRoot.innerHTML = `
    <section class="staff-home">
      <header class="staff-home-intro">
        <div>
          <span class="staff-eyebrow">${escapeHtml(t("staff.home.eyebrow"))}</span>
          <h1>${escapeHtml(t("staff.home.greeting", { name: firstName }))}</h1>
          <p>${escapeHtml(t("staff.home.description"))}</p>
        </div>
        <div class="staff-home-status">
          <span aria-hidden="true">✓</span>
          <p>
            <strong>${escapeHtml(t("staff.home.signedIn"))}</strong>
            <small>${escapeHtml(state.session?.user?.email || "")}</small>
          </p>
        </div>
      </header>

      <section aria-labelledby="quickActionsTitle">
        <div class="staff-section-heading">
          <div>
            <span>${escapeHtml(t("staff.home.quickEyebrow"))}</span>
            <h2 id="quickActionsTitle">${escapeHtml(t("staff.home.quickTitle"))}</h2>
          </div>
        </div>
        <div class="staff-action-grid">
          ${homeCard({
            type: "expense",
            icon: "€",
            title: "staff.home.addExpense",
            text: "staff.home.addExpenseText"
          })}
          <button class="staff-action-card staff-action-card--mine" type="button" data-action="navigate" data-view="mine">
            <span class="staff-action-icon" aria-hidden="true">▤</span>
            <span class="staff-action-copy">
              <strong>${escapeHtml(t("staff.home.mySubmissions"))}</strong>
              <small>${escapeHtml(t("staff.home.mySubmissionsText"))}</small>
            </span>
            <span class="staff-action-arrow" aria-hidden="true">→</span>
          </button>
          ${homeCard({
            type: "news",
            icon: "✦",
            title: "staff.home.addNews",
            text: "staff.home.addNewsText"
          })}
          ${homeCard({
            type: "invoice",
            icon: "↗",
            title: "staff.home.addInvoice",
            text: "staff.home.addInvoiceText"
          })}
        </div>
        ${availableTypes("mine").some((type) => ["expense", "invoice"].includes(type) && !templateAvailable(type)) ? `
          <aside class="staff-template-warning" role="status">
            <span aria-hidden="true">!</span>
            <p>${escapeHtml(t("staff.templates.configure"))}</p>
          </aside>
        ` : ""}
      </section>

      <section class="staff-recent" aria-labelledby="recentTitle">
        <div class="staff-section-heading">
          <div>
            <span>${escapeHtml(t("staff.home.recentEyebrow"))}</span>
            <h2 id="recentTitle">${escapeHtml(t("staff.home.recentTitle"))}</h2>
          </div>
          <button class="staff-text-button" type="button" data-action="navigate" data-view="mine">
            ${escapeHtml(t("staff.common.viewAll"))}<span aria-hidden="true">→</span>
          </button>
        </div>
        <div id="recentSubmissions" class="staff-list-compact">
          <div class="staff-inline-loading staff-inline-loading--small" role="status">
            <span class="staff-loader" aria-hidden="true"></span>
            <p>${escapeHtml(t("staff.common.loading"))}</p>
          </div>
        </div>
      </section>
    </section>
  `;
  void loadRecentSubmissions();
}

function extractList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.submissions)) return payload.submissions;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function extractSubmission(payload) {
  if (payload?.submission && typeof payload.submission === "object") return payload.submission;
  if (payload?.item && typeof payload.item === "object") return payload.item;
  return payload && typeof payload === "object" ? payload : null;
}

function normalizeSubmission(record) {
  if (!record || typeof record !== "object") return null;
  return {
    ...record,
    type: record.type || record.kind || "unknown",
    status: record.status || "DRAFT",
    data: record.data && typeof record.data === "object"
      ? record.data
      : record.payload && typeof record.payload === "object"
        ? record.payload
        : {}
  };
}

function submissionTitle(record) {
  const data = record.data || {};

  if (record.type === "news") return data.title || t("staff.news.untitled");
  if (record.type === "expense") return data.project || data.person || t("staff.expense.untitled");
  if (record.type === "invoice") return data.client || data.invoiceNumber || t("staff.invoice.untitled");
  return t("staff.common.untitled");
}

function submissionCard(record, scope = "mine", compact = false) {
  const item = normalizeSubmission(record);
  if (!item) return "";
  const updated = item.updatedAt || item.createdAt;

  return `
    <button
      class="staff-submission-card${compact ? " staff-submission-card--compact" : ""}"
      type="button"
      data-action="open-submission"
      data-id="${escapeHtml(item.id || "")}"
      data-scope="${escapeHtml(scope)}"
    >
      <span class="staff-type-icon staff-type-icon--${escapeHtml(item.type)}" aria-hidden="true">
        ${item.type === "news" ? "✦" : item.type === "expense" ? "€" : "↗"}
      </span>
      <span class="staff-submission-copy">
        <span class="staff-submission-topline">
          <small>${escapeHtml(t(typeKey(item.type)))}</small>
          <span class="staff-status staff-status--${escapeHtml(String(item.status).toLowerCase())}">${escapeHtml(t(statusKey(item.status)))}</span>
        </span>
        <strong>${escapeHtml(submissionTitle(item))}</strong>
        <small>${escapeHtml(t("staff.list.updated", { date: formatDateTime(updated) }))}</small>
      </span>
      <span class="staff-submission-arrow" aria-hidden="true">→</span>
    </button>
  `;
}

async function loadRecentSubmissions() {
  const target = document.getElementById("recentSubmissions");
  if (!target) return;

  try {
    const payload = await api.listSubmissions({ scope: "mine" });
    const items = extractList(payload).map(normalizeSubmission).filter(Boolean).slice(0, 4);

    if (!document.body.contains(target)) return;

    target.innerHTML = items.length
      ? items.map((item) => submissionCard(item, "mine", true)).join("")
      : emptyState("staff.home.emptyTitle", "staff.home.emptyText", "small");
  } catch (error) {
    if (document.body.contains(target)) {
      target.innerHTML = inlineError("staff.errors.listLoad");
    }
  }
}

async function refreshReviewBadge() {
  const badge = document.getElementById("reviewBadge");
  if (!badge || !canReview()) {
    if (badge) badge.hidden = true;
    return;
  }
  try {
    const payload = await api.listSubmissions({ scope: "review" });
    const count = extractList(payload).length;
    badge.textContent = String(count);
    badge.hidden = count === 0;
  } catch {
    badge.hidden = true;
  }
}

function emptyState(titleKey, textKey, size = "") {
  return `
    <div class="staff-empty-state${size ? ` staff-empty-state--${size}` : ""}">
      <span class="staff-empty-symbol" aria-hidden="true">○</span>
      <h2>${escapeHtml(t(titleKey))}</h2>
      <p>${escapeHtml(t(textKey))}</p>
    </div>
  `;
}

function inlineError(key) {
  return `
    <div class="staff-inline-error" role="alert">
      <span aria-hidden="true">!</span>
      <p>${escapeHtml(t(key))}</p>
      <button type="button" data-action="reload-view">${escapeHtml(t("staff.common.tryAgain"))}</button>
    </div>
  `;
}

async function renderList(scope, type = "") {
  state.listScope = scope;
  const review = scope === "review";
  const filterTypes = availableTypes(scope);
  if (type && !filterTypes.includes(type)) type = "";
  state.listType = type;

  elements.viewRoot.innerHTML = `
    <section class="staff-list-view">
      ${pageHeader({
        eyebrow: review ? "staff.list.reviewEyebrow" : "staff.list.mineEyebrow",
        title: review ? "staff.list.reviewTitle" : "staff.list.mineTitle",
        description: review ? "staff.list.reviewDescription" : "staff.list.mineDescription"
      })}

      <div class="staff-filter-row" role="group" aria-label="${escapeHtml(t("staff.list.filterLabel"))}">
        ${["", ...filterTypes].map((value) => `
          <button
            class="staff-filter-button${value === type ? " is-active" : ""}"
            type="button"
            data-action="filter-submissions"
            data-type="${escapeHtml(value)}"
          >${escapeHtml(t(value ? typeKey(value) : "staff.list.allTypes"))}</button>
        `).join("")}
      </div>

      <div id="submissionList" class="staff-submission-list">
        <div class="staff-inline-loading" role="status">
          <span class="staff-loader" aria-hidden="true"></span>
          <p>${escapeHtml(t("staff.common.loading"))}</p>
        </div>
      </div>
    </section>
  `;

  try {
    const payload = await api.listSubmissions({ scope, type });
    const items = extractList(payload).map(normalizeSubmission).filter(Boolean);
    const target = document.getElementById("submissionList");

    if (!target || state.view !== scope) return;

    target.innerHTML = items.length
      ? items.map((item) => submissionCard(item, scope)).join("")
      : emptyState(
          review ? "staff.list.reviewEmptyTitle" : "staff.list.mineEmptyTitle",
          review ? "staff.list.reviewEmptyText" : "staff.list.mineEmptyText"
        );
  } catch (error) {
    const target = document.getElementById("submissionList");
    if (target) target.innerHTML = inlineError("staff.errors.listLoad");
  }
}

function field({
  id,
  name = id,
  label,
  value = "",
  type = "text",
  required = false,
  placeholder = "",
  hint = "",
  wide = false,
  min = "",
  max = "",
  step = "",
  inputmode = "",
  ai = null,
  rows = 5,
  autocomplete = "off"
}) {
  const attributes = [
    `id="${escapeHtml(id)}"`,
    `name="${escapeHtml(name)}"`,
    `type="${escapeHtml(type)}"`,
    `value="${escapeHtml(value)}"`,
    `autocomplete="${escapeHtml(autocomplete)}"`,
    required ? "required" : "",
    placeholder ? `placeholder="${escapeHtml(t(placeholder))}"` : "",
    min !== "" ? `min="${escapeHtml(min)}"` : "",
    max !== "" ? `max="${escapeHtml(max)}"` : "",
    step !== "" ? `step="${escapeHtml(step)}"` : "",
    inputmode ? `inputmode="${escapeHtml(inputmode)}"` : ""
  ].filter(Boolean).join(" ");

  const control = type === "textarea"
    ? `<textarea ${attributes.replace(`type="${escapeHtml(type)}" value="${escapeHtml(value)}" `, "")} rows="${rows}">${escapeHtml(value)}</textarea>`
    : `<input ${attributes}>`;

  return `
    <label class="staff-field${wide ? " staff-field--wide" : ""}" for="${escapeHtml(id)}">
      <span class="staff-field-label">
        <span>${escapeHtml(t(label))}${required ? `<span aria-hidden="true"> *</span>` : ""}</span>
        ${ai ? aiButton(id, ai.field, ai.mode) : ""}
      </span>
      ${control}
      ${hint ? `<small>${escapeHtml(t(hint))}</small>` : ""}
    </label>
  `;
}

function aiButton(targetId, fieldName, mode = "fix_language") {
  if (!state.session?.aiAvailable) return "";

  return `
    <button
      class="staff-ai-button"
      type="button"
      data-action="open-ai"
      data-target="${escapeHtml(targetId)}"
      data-field="${escapeHtml(fieldName)}"
      data-mode="${escapeHtml(mode)}"
    >
      <span aria-hidden="true">✦</span>
      <span>${escapeHtml(t("staff.ai.improve"))}</span>
    </button>
  `;
}

function selectField({ id, label, value = "", options, required = false, wide = false, hint = "" }) {
  return `
    <label class="staff-field${wide ? " staff-field--wide" : ""}" for="${escapeHtml(id)}">
      <span class="staff-field-label"><span>${escapeHtml(t(label))}${required ? `<span aria-hidden="true"> *</span>` : ""}</span></span>
      <select id="${escapeHtml(id)}" name="${escapeHtml(id)}"${required ? " required" : ""}>
        ${options.map((option) => `
          <option value="${escapeHtml(option.value)}"${String(option.value) === String(value) ? " selected" : ""}>
            ${escapeHtml(t(option.label))}
          </option>
        `).join("")}
      </select>
      ${hint ? `<small>${escapeHtml(t(hint))}</small>` : ""}
    </label>
  `;
}

function checkboxField({ id, label, checked = false, hint = "" }) {
  return `
    <label class="staff-checkbox staff-field--wide" for="${escapeHtml(id)}">
      <input id="${escapeHtml(id)}" name="${escapeHtml(id)}" type="checkbox"${checked ? " checked" : ""}>
      <span class="staff-checkbox-mark" aria-hidden="true"></span>
      <span>
        <strong>${escapeHtml(t(label))}</strong>
        ${hint ? `<small>${escapeHtml(t(hint))}</small>` : ""}
      </span>
    </label>
  `;
}

function fileField({ id, label, group, accept, multiple = false, hint }) {
  const count = state.pendingFiles.get(group)?.length || 0;
  return `
    <label class="staff-file-field staff-field--wide" for="${escapeHtml(id)}">
      <span class="staff-file-icon" aria-hidden="true">＋</span>
      <span class="staff-file-copy">
        <strong>${escapeHtml(t(label))}</strong>
        <small>${escapeHtml(count
          ? t("staff.files.selectedCount", { count })
          : t(hint))}</small>
      </span>
      <input
        id="${escapeHtml(id)}"
        type="file"
        accept="${escapeHtml(accept)}"
        data-file-group="${escapeHtml(group)}"
        ${multiple ? "multiple" : ""}
      >
      <span class="staff-file-action">${escapeHtml(t("staff.files.choose"))}</span>
    </label>
  `;
}

function reviewBanner(record) {
  const reviews = Array.isArray(record?.reviews) ? record.reviews : [];
  const latest = reviews.find((entry) => entry?.comment);
  const directComment = record?.reviewComment || record?.latestReview?.comment;
  const comment = directComment || latest?.comment;

  if (!comment) return "";

  return `
    <aside class="staff-review-banner" role="status">
      <span class="staff-review-banner-icon" aria-hidden="true">↩</span>
      <div>
        <strong>${escapeHtml(t("staff.review.returnedTitle"))}</strong>
        <p>${escapeHtml(comment)}</p>
      </div>
    </aside>
  `;
}

function newsForm(data) {
  return `
    <section class="staff-form-section">
      <div class="staff-form-section-heading">
        <span>01</span>
        <div>
          <h2>${escapeHtml(t("staff.news.basicSection"))}</h2>
          <p>${escapeHtml(t("staff.news.basicSectionText"))}</p>
        </div>
      </div>
      <div class="staff-form-grid">
        ${field({ id: "newsTitle", label: "staff.news.title", value: data.title, required: true, wide: true, placeholder: "staff.news.titlePlaceholder", ai: { field: "news.title", mode: "news" } })}
        ${field({ id: "newsSlug", label: "staff.news.slug", value: data.slug || data.id, required: true, placeholder: "staff.news.slugPlaceholder", hint: "staff.news.slugHint" })}
        ${field({ id: "newsDate", label: "staff.news.date", value: data.date, type: "date", required: true })}
        ${selectField({
          id: "newsCategory",
          label: "staff.news.category",
          value: data.category || "initiatives",
          required: true,
          options: ["achievements", "events", "initiatives", "opportunities"].map((value) => ({
            value,
            label: `news.categories.${value}`
          }))
        })}
        ${field({ id: "newsProject", label: "staff.news.project", value: data.project, placeholder: "staff.news.projectPlaceholder" })}
        ${field({ id: "newsAuthor", label: "staff.news.author", value: data.author || state.session?.user?.name, required: true, autocomplete: "name" })}
        ${field({ id: "newsAuthorRole", label: "staff.news.authorRole", value: data.authorRole, placeholder: "staff.news.authorRolePlaceholder" })}
        ${field({ id: "newsSummary", label: "staff.news.summary", value: data.summary || data.excerpt, type: "textarea", rows: 4, required: true, wide: true, placeholder: "staff.news.summaryPlaceholder", ai: { field: "news.summary", mode: "news" } })}
      </div>
    </section>

    <section class="staff-form-section">
      <div class="staff-form-section-heading">
        <span>02</span>
        <div>
          <h2>${escapeHtml(t("staff.news.contentSection"))}</h2>
          <p>${escapeHtml(t("staff.news.contentSectionText"))}</p>
        </div>
      </div>
      <div class="staff-form-grid">
        ${field({ id: "newsContent", label: "staff.news.content", value: Array.isArray(data.content) ? data.content.join("\n\n") : data.content, type: "textarea", rows: 14, required: true, wide: true, placeholder: "staff.news.contentPlaceholder", hint: "staff.news.contentHint", ai: { field: "news.content", mode: "news" } })}
      </div>
    </section>

    <section class="staff-form-section">
      <div class="staff-form-section-heading">
        <span>03</span>
        <div>
          <h2>${escapeHtml(t("staff.news.imagesSection"))}</h2>
          <p>${escapeHtml(t("staff.news.imagesSectionText"))}</p>
        </div>
      </div>
      <div class="staff-form-grid">
        ${field({ id: "newsImage", label: "staff.news.imageUrl", value: data.image, type: "url", wide: true, placeholder: "staff.news.imageUrlPlaceholder", hint: "staff.news.imageUrlHint" })}
        ${field({ id: "newsImageAlt", label: "staff.news.imageAlt", value: data.imageAlt, wide: true, placeholder: "staff.news.imageAltPlaceholder" })}
        ${field({ id: "newsImagePosition", label: "staff.news.imagePosition", value: data.imagePosition || "center center", hint: "staff.news.imagePositionHint" })}
        ${selectField({
          id: "newsImageFit",
          label: "staff.news.imageFit",
          value: data.imageFit || "cover",
          options: [
            { value: "cover", label: "staff.news.imageFitCover" },
            { value: "contain", label: "staff.news.imageFitContain" }
          ]
        })}
        ${fileField({ id: "newsMainImage", label: "staff.news.mainImage", group: "news-main", accept: ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp", hint: "staff.news.mainImageHint" })}
        ${fileField({ id: "newsAdditionalImages", label: "staff.news.additionalImages", group: "news-additional", accept: ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp", multiple: true, hint: "staff.news.additionalImagesHint" })}
        ${checkboxField({ id: "newsFeatured", label: "staff.news.featured", checked: Boolean(data.featured), hint: "staff.news.featuredHint" })}
      </div>
    </section>
  `;
}

function expenseItemRow(item = {}, index = 0) {
  return `
    <fieldset class="staff-line-item" data-line-item="expense">
      <legend>${escapeHtml(t("staff.expense.itemLegend", { number: index + 1 }))}</legend>
      <button class="staff-line-remove" type="button" data-action="remove-line" data-i18n-aria-label="staff.common.remove">
        <span aria-hidden="true">×</span>
      </button>
      <div class="staff-form-grid">
        ${field({ id: `expenseItemDate${index}`, label: "staff.expense.itemDate", value: item.date, type: "date", required: true })}
        ${field({ id: `expenseDocumentNumber${index}`, label: "staff.expense.documentNumber", value: item.documentNumber, required: true })}
        ${field({ id: `expenseVendor${index}`, label: "staff.expense.vendor", value: item.vendor, required: true })}
        ${field({ id: `expenseItemDescription${index}`, label: "staff.expense.itemDescription", value: item.description, required: true, wide: true })}
        ${field({ id: `expenseItemAmount${index}`, label: "staff.common.amount", value: item.amount, type: "number", required: true, min: "0", step: "0.01", inputmode: "decimal" })}
      </div>
    </fieldset>
  `;
}

function expenseForm(data) {
  const items = Array.isArray(data.items) && data.items.length ? data.items : [{}];
  return `
    <section class="staff-form-section">
      <div class="staff-form-section-heading">
        <span>01</span>
        <div>
          <h2>${escapeHtml(t("staff.expense.generalSection"))}</h2>
          <p>${escapeHtml(t("staff.expense.generalSectionText"))}</p>
        </div>
      </div>
      <div class="staff-form-grid">
        ${field({ id: "expenseProject", label: "staff.expense.project", value: data.project, required: true, placeholder: "staff.expense.projectPlaceholder" })}
        ${field({ id: "expensePerson", label: "staff.expense.person", value: data.person || state.session?.user?.name, required: true, autocomplete: "name" })}
        ${field({ id: "expenseDate", label: "staff.expense.date", value: data.date, type: "date", required: true })}
        ${field({ id: "expenseLocation", label: "staff.expense.location", value: data.location, required: true, placeholder: "staff.expense.locationPlaceholder" })}
        ${field({ id: "expenseActivity", label: "staff.expense.activity", value: data.activity, type: "textarea", rows: 5, required: true, wide: true, placeholder: "staff.expense.activityPlaceholder", ai: { field: "expense.activity", mode: "formal" } })}
        ${field({ id: "expensePurpose", label: "staff.expense.purpose", value: data.purpose, type: "textarea", rows: 5, required: true, wide: true, placeholder: "staff.expense.purposePlaceholder", ai: { field: "expense.goal", mode: "formal" } })}
        ${field({ id: "expenseResult", label: "staff.expense.result", value: data.result, type: "textarea", rows: 5, required: true, wide: true, placeholder: "staff.expense.resultPlaceholder", ai: { field: "expense.result", mode: "formal" } })}
      </div>
    </section>

    <section class="staff-form-section">
      <div class="staff-form-section-heading">
        <span>02</span>
        <div>
          <h2>${escapeHtml(t("staff.expense.costSection"))}</h2>
          <p>${escapeHtml(t("staff.expense.costSectionText"))}</p>
        </div>
      </div>
      <div id="expenseItems" class="staff-line-items">
        ${items.map(expenseItemRow).join("")}
      </div>
      <button class="staff-add-line" type="button" data-action="add-line" data-type="expense">
        <span aria-hidden="true">＋</span>
        <span>${escapeHtml(t("staff.expense.addItem"))}</span>
      </button>
      <div class="staff-form-total">
        <span>${escapeHtml(t("staff.common.total"))}</span>
        <strong id="expenseLiveTotal">${escapeHtml(formatMoney(0))}</strong>
      </div>
    </section>

    <section class="staff-form-section">
      <div class="staff-form-section-heading">
        <span>03</span>
        <div>
          <h2>${escapeHtml(t("staff.expense.documentsSection"))}</h2>
          <p>${escapeHtml(t("staff.expense.documentsSectionText"))}</p>
        </div>
      </div>
      <div class="staff-form-grid">
        ${fileField({ id: "expensePrimaryDocument", label: "staff.expense.primaryDocument", group: "expense-primary", accept: ".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx,application/pdf,image/jpeg,image/png,image/webp", hint: "staff.expense.primaryDocumentHint" })}
        ${fileField({ id: "expenseAdditionalDocuments", label: "staff.expense.additionalDocuments", group: "expense-additional", accept: ".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx,application/pdf,image/jpeg,image/png,image/webp", multiple: true, hint: "staff.expense.additionalDocumentsHint" })}
      </div>
    </section>
  `;
}

function invoiceItemRow(item = {}, index = 0) {
  return `
    <fieldset class="staff-line-item" data-line-item="invoice">
      <legend>${escapeHtml(t("staff.invoice.itemLegend", { number: index + 1 }))}</legend>
      <button class="staff-line-remove" type="button" data-action="remove-line" data-i18n-aria-label="staff.common.remove"><span aria-hidden="true">×</span></button>
      <div class="staff-form-grid">
        ${field({ id: `invoiceItemDescription${index}`, label: "staff.invoice.itemDescription", value: item.description, required: true, wide: true, ai: { field: "invoice.description", mode: "formal" } })}
        ${field({ id: `invoiceQuantity${index}`, label: "staff.invoice.quantity", value: item.quantity ?? 1, type: "number", required: true, min: "0.01", step: "0.01", inputmode: "decimal" })}
        ${field({ id: `invoiceUnit${index}`, label: "staff.invoice.unit", value: item.unit || t("staff.invoice.defaultUnit"), required: true })}
        ${field({ id: `invoiceUnitPrice${index}`, label: "staff.invoice.unitPrice", value: item.unitPrice, type: "number", required: true, min: "0", step: "0.01", inputmode: "decimal" })}
        <div class="staff-line-total">
          <span>${escapeHtml(t("staff.common.lineTotal"))}</span>
          <strong data-invoice-line-total>${escapeHtml(formatMoney(0))}</strong>
        </div>
      </div>
    </fieldset>
  `;
}

function invoiceForm(data) {
  const items = Array.isArray(data.items) && data.items.length ? data.items : [{}];
  return `
    <section class="staff-form-section">
      <div class="staff-form-section-heading">
        <span>01</span>
        <div>
          <h2>${escapeHtml(t("staff.invoice.detailsSection"))}</h2>
          <p>${escapeHtml(t("staff.invoice.detailsSectionText"))}</p>
        </div>
      </div>
      <div class="staff-form-grid">
        ${field({ id: "invoiceNumber", label: "staff.invoice.invoiceNumber", value: data.invoiceNumber, required: true, placeholder: "staff.invoice.invoiceNumberPlaceholder" })}
        ${field({ id: "invoiceDate", label: "staff.invoice.invoiceDate", value: data.invoiceDate, type: "date", required: true })}
        ${field({ id: "invoiceDueDate", label: "staff.invoice.dueDate", value: data.dueDate, type: "date", required: true })}
        ${selectField({
          id: "invoiceCurrency",
          label: "staff.invoice.currency",
          value: data.currency || "EUR",
          required: true,
          options: [{ value: "EUR", label: "staff.invoice.currencyEur" }]
        })}
        ${field({ id: "invoiceProject", label: "staff.invoice.project", value: data.project, required: true, placeholder: "staff.invoice.projectPlaceholder" })}
        ${field({ id: "invoiceReferenceNumber", label: "staff.invoice.referenceNumber", value: data.referenceNumber, placeholder: "staff.invoice.referenceNumberPlaceholder" })}
      </div>
    </section>

    <section class="staff-form-section">
      <div class="staff-form-section-heading">
        <span>02</span>
        <div>
          <h2>${escapeHtml(t("staff.invoice.clientSection"))}</h2>
          <p>${escapeHtml(t("staff.invoice.clientSectionText"))}</p>
        </div>
      </div>
      <div class="staff-form-grid">
        ${field({ id: "invoiceClient", label: "staff.invoice.client", value: data.client, required: true, wide: true, autocomplete: "organization" })}
        ${field({ id: "invoiceRegistrationCode", label: "staff.invoice.registrationCode", value: data.registrationCode, required: true, inputmode: "numeric" })}
        ${field({ id: "invoiceAddress", label: "staff.invoice.address", value: data.address, required: true, wide: true, autocomplete: "street-address" })}
      </div>
    </section>

    <section class="staff-form-section">
      <div class="staff-form-section-heading">
        <span>03</span>
        <div>
          <h2>${escapeHtml(t("staff.invoice.itemsSection"))}</h2>
          <p>${escapeHtml(t("staff.invoice.itemsSectionText"))}</p>
        </div>
      </div>
      <div id="invoiceItems" class="staff-line-items">
        ${items.map(invoiceItemRow).join("")}
      </div>
      <button class="staff-add-line" type="button" data-action="add-line" data-type="invoice">
        <span aria-hidden="true">＋</span>
        <span>${escapeHtml(t("staff.invoice.addItem"))}</span>
      </button>
      <div class="staff-form-total">
        <span>${escapeHtml(t("staff.common.total"))}</span>
        <strong id="invoiceLiveTotal">${escapeHtml(formatMoney(0, data.currency || "EUR"))}</strong>
      </div>
    </section>

    <section class="staff-form-section">
      <div class="staff-form-section-heading">
        <span>04</span>
        <div>
          <h2>${escapeHtml(t("staff.invoice.notesSection"))}</h2>
          <p>${escapeHtml(t("staff.invoice.notesSectionText"))}</p>
        </div>
      </div>
      <div class="staff-form-grid">
        ${field({ id: "invoiceAdditionalInfo", label: "staff.invoice.additionalInfo", value: data.additionalInfo, type: "textarea", rows: 5, wide: true, placeholder: "staff.invoice.additionalInfoPlaceholder", ai: { field: "invoice.additionalInfo", mode: "formal" } })}
      </div>
    </section>
  `;
}

function renderForm(type, record = null) {
  if (!canCreate(type)) {
    showToast("staff.errors.forbidden", "error");
    return;
  }

  const normalized = normalizeSubmission(record);
  const data = normalized?.data || {};
  state.view = "form";
  state.formType = type;
  state.editingId = normalized?.id || state.editingId || null;
  state.current = normalized;
  setActiveNavigation("form");

  const titleKey = state.editingId
    ? `staff.${type}.editTitle`
    : `staff.${type}.createTitle`;
  const body = type === "news"
    ? newsForm(data)
    : type === "expense"
      ? expenseForm(data)
      : invoiceForm(data);

  elements.viewRoot.innerHTML = `
    <section class="staff-form-view">
      ${pageHeader({
        eyebrow: `staff.${type}.eyebrow`,
        title: titleKey,
        description: `staff.${type}.formDescription`,
        backView: "mine"
      })}
      ${reviewBanner(normalized)}
      <form id="submissionForm" class="staff-form" data-type="${escapeHtml(type)}" novalidate>
        ${body}
        <footer class="staff-form-footer">
          <p>
            <span aria-hidden="true">●</span>
            <span>${escapeHtml(t("staff.form.draftNotice"))}</span>
          </p>
          <div>
            <button class="staff-button staff-button--ghost" type="button" data-action="save-draft">
              <span aria-hidden="true">✓</span>
              <span>${escapeHtml(t("staff.form.saveDraft"))}</span>
            </button>
            <button class="staff-button staff-button--primary" type="submit">
              <span>${escapeHtml(t("staff.form.preview"))}</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </footer>
      </form>
    </section>
  `;

  applyTranslations(elements.viewRoot);
  updateLiveTotals();
  focusMain();
}

function inputValue(id) {
  return document.getElementById(id)?.value?.trim() || "";
}

function numberValue(id) {
  const raw = document.getElementById(id)?.value;
  if (raw === "" || raw === undefined) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function collectNewsData() {
  const mainFiles = state.pendingFiles.get("news-main") || [];
  const additionalFiles = state.pendingFiles.get("news-additional") || [];
  const data = {
    slug: inputValue("newsSlug"),
    date: inputValue("newsDate"),
    category: inputValue("newsCategory"),
    project: inputValue("newsProject"),
    title: inputValue("newsTitle"),
    summary: inputValue("newsSummary"),
    excerpt: inputValue("newsSummary"),
    author: inputValue("newsAuthor"),
    authorRole: inputValue("newsAuthorRole"),
    content: contentToParagraphs(inputValue("newsContent")),
    image: inputValue("newsImage"),
    imageAlt: inputValue("newsImageAlt"),
    imagePosition: inputValue("newsImagePosition") || "center center",
    imageFit: inputValue("newsImageFit") || "cover",
    featured: Boolean(document.getElementById("newsFeatured")?.checked),
    placeholder: false,
    published: false
  };

  if (mainFiles[0]) {
    const url = URL.createObjectURL(mainFiles[0]);
    state.objectUrls.push(url);
    data._mainImagePreview = url;
  }

  if (additionalFiles.length) {
    data._additionalImagePreviews = additionalFiles.map((file) => {
      const url = URL.createObjectURL(file);
      state.objectUrls.push(url);
      return url;
    });
  }

  return data;
}

function collectExpenseItems() {
  return [...document.querySelectorAll('[data-line-item="expense"]')].map((row) => ({
    date: row.querySelector('[id^="expenseItemDate"]')?.value || "",
    documentNumber: row.querySelector('[id^="expenseDocumentNumber"]')?.value?.trim() || "",
    vendor: row.querySelector('[id^="expenseVendor"]')?.value?.trim() || "",
    description: row.querySelector('[id^="expenseItemDescription"]')?.value?.trim() || "",
    amount: Number(row.querySelector('[id^="expenseItemAmount"]')?.value) || 0
  }));
}

function collectExpenseData() {
  const items = collectExpenseItems();
  return {
    project: inputValue("expenseProject"),
    person: inputValue("expensePerson"),
    date: inputValue("expenseDate"),
    location: inputValue("expenseLocation"),
    activity: inputValue("expenseActivity"),
    purpose: inputValue("expensePurpose"),
    result: inputValue("expenseResult"),
    items,
    amount: items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
  };
}

function collectInvoiceItems() {
  return [...document.querySelectorAll('[data-line-item="invoice"]')].map((row) => {
    const quantity = Number(row.querySelector('[id^="invoiceQuantity"]')?.value) || 0;
    const unitPrice = Number(row.querySelector('[id^="invoiceUnitPrice"]')?.value) || 0;
    return {
      description: row.querySelector('[id^="invoiceItemDescription"]')?.value?.trim() || "",
      quantity,
      unit: row.querySelector('[id^="invoiceUnit"]')?.value?.trim() || "",
      unitPrice,
      total: quantity * unitPrice
    };
  });
}

function collectInvoiceData() {
  const items = collectInvoiceItems();
  return {
    invoiceNumber: inputValue("invoiceNumber"),
    invoiceDate: inputValue("invoiceDate"),
    dueDate: inputValue("invoiceDueDate"),
    currency: inputValue("invoiceCurrency") || "EUR",
    project: inputValue("invoiceProject"),
    referenceNumber: inputValue("invoiceReferenceNumber"),
    client: inputValue("invoiceClient"),
    registrationCode: inputValue("invoiceRegistrationCode"),
    address: inputValue("invoiceAddress"),
    additionalInfo: inputValue("invoiceAdditionalInfo"),
    items,
    amount: items.reduce((sum, item) => sum + (Number(item.total) || 0), 0)
  };
}

function collectFormData() {
  if (state.formType === "news") return collectNewsData();
  if (state.formType === "expense") return collectExpenseData();
  if (state.formType === "invoice") return collectInvoiceData();
  return {};
}

function cleanSubmissionData(data) {
  return Object.fromEntries(
    Object.entries(data || {})
      .filter(([key]) => !key.startsWith("_"))
      .map(([key, value]) => [
        key,
        Array.isArray(value)
          ? value.map((entry) => entry && typeof entry === "object"
              ? cleanSubmissionData(entry)
              : entry)
          : value && typeof value === "object"
            ? cleanSubmissionData(value)
            : value
      ])
  );
}

function validateCurrentForm() {
  const form = document.getElementById("submissionForm");
  if (!form) return false;

  const valid = form.checkValidity();

  if (!valid) {
    form.classList.add("was-validated");
    form.reportValidity();
    showToast("staff.errors.requiredFields", "error");
  }

  return valid;
}

function fileFingerprint(file) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function pendingFiles() {
  return [...state.pendingFiles.values()].flat();
}

async function uploadPendingFiles(submissionId) {
  for (const [group, groupFiles] of state.pendingFiles.entries()) {
    const kind = group.endsWith("-primary") || group === "news-main" ? "primary" : "additional";
    const files = groupFiles.filter((file) => !state.uploadedFiles.has(fileFingerprint(file)));
    for (const file of files) {
      await api.uploadAttachment(submissionId, file, kind);
      state.uploadedFiles.add(fileFingerprint(file));
    }
  }
}

async function saveData(type, data) {
  const cleanData = cleanSubmissionData(data);
  let saved;

  if (state.editingId) {
    const payload = await api.updateSubmission(state.editingId, cleanData);
    saved = normalizeSubmission(extractSubmission(payload)) || {
      ...(state.current || {}),
      id: state.editingId,
      type,
      status: state.current?.status || "DRAFT",
      data: cleanData
    };
  } else {
    const payload = await api.createSubmission(type, cleanData);
    saved = normalizeSubmission(extractSubmission(payload));

    if (!saved?.id) {
      throw new ApiError("missing_submission_id", 500, payload);
    }

    state.editingId = saved.id;
  }

  await uploadPendingFiles(saved.id || state.editingId);
  state.current = {
    ...saved,
    type,
    data: cleanData
  };
  return state.current;
}

async function saveDraft(button) {
  if (!validateCurrentForm()) return null;
  const data = collectFormData();
  setBusy(button, true, "staff.form.saving");

  try {
    const saved = await saveData(state.formType, data);
    showToast("staff.form.saved", "success");
    return saved;
  } catch (error) {
    handleError(error);
    return null;
  } finally {
    setBusy(button, false);
  }
}

function renderPreview(type, data) {
  state.view = "preview";
  state.preview = { type, data };
  setActiveNavigation("preview");

  elements.viewRoot.innerHTML = `
    <section class="staff-preview-view staff-preview-view--${escapeHtml(type)}">
      ${pageHeader({
        eyebrow: "staff.preview.eyebrow",
        title: "staff.preview.title",
        description: `staff.${type}.previewDescription`,
        backView: ""
      })}
      <div class="staff-preview-toolbar">
        <div>
          <span aria-hidden="true">◉</span>
          <p>
            <strong>${escapeHtml(t("staff.preview.label"))}</strong>
            <small>${escapeHtml(t("staff.preview.notPublished"))}</small>
          </p>
        </div>
        <button class="staff-button staff-button--ghost" type="button" data-action="edit-preview">
          <span aria-hidden="true">←</span>
          <span>${escapeHtml(t(type === "expense" ? "staff.preview.back" : "staff.preview.edit"))}</span>
        </button>
      </div>
      <div class="staff-preview-canvas">
        ${renderSubmissionPreview(type, data)}
      </div>
      <footer class="staff-preview-actions">
        <button class="staff-button staff-button--ghost" type="button" data-action="save-preview">
          <span aria-hidden="true">✓</span>
          <span>${escapeHtml(t("staff.form.saveDraft"))}</span>
        </button>
        <button class="staff-button staff-button--primary" type="button" data-action="submit-preview">
          <span>${escapeHtml(t(type === "invoice" ? "staff.preview.createInvoice" : "staff.preview.confirmSubmit"))}</span>
          <span aria-hidden="true">→</span>
        </button>
      </footer>
    </section>
  `;
  focusMain();
}

function hasPrimaryExpenseDocument() {
  const existing = Array.isArray(state.current?.attachments)
    ? state.current.attachments.some((attachment) => attachment.kind === "primary")
    : false;
  return existing || (state.pendingFiles.get("expense-primary")?.length || 0) > 0;
}

function renderSubmissionSuccess(type, record) {
  state.view = "success";
  state.lastSubmitted = { type, record };
  setActiveNavigation("mine");
  elements.viewRoot.innerHTML = `
    <section class="staff-success-view" role="status">
      <span class="staff-success-icon" aria-hidden="true">✓</span>
      <span class="staff-eyebrow">${escapeHtml(t("staff.success.eyebrow"))}</span>
      <h1>${escapeHtml(t(`staff.success.${type}Title`))}</h1>
      <p>${escapeHtml(t(`staff.success.${type}Text`))}</p>
      <div class="staff-success-actions">
        <button class="staff-button staff-button--primary" type="button" data-action="navigate" data-view="mine">
          ${escapeHtml(t("staff.home.mySubmissions"))}
        </button>
        <button class="staff-button staff-button--ghost" type="button" data-action="navigate" data-view="home">
          ${escapeHtml(t("staff.navigation.home"))}
        </button>
      </div>
    </section>
  `;
  focusMain();
}

async function savePreview(button, submit = false) {
  if (!state.preview) return;
  if (submit && state.preview.type === "expense" && !hasPrimaryExpenseDocument()) {
    showToast("staff.errors.primaryAttachmentRequired", "error");
    return;
  }
  setBusy(button, true, submit ? "staff.preview.submitting" : "staff.form.saving");

  try {
    const saved = await saveData(state.preview.type, state.preview.data);

    if (submit) {
      const payload = await api.submitSubmission(saved.id);
      const submitted = normalizeSubmission(extractSubmission(payload)) || saved;
      showToast(`staff.success.${state.preview.type}Toast`, "success");
      const submittedType = state.preview.type;
      resetFormState();
      renderSubmissionSuccess(submittedType, submitted);
    } else {
      showToast("staff.form.saved", "success");
    }
  } catch (error) {
    handleError(error);
  } finally {
    setBusy(button, false);
  }
}

function updateLineLegends(type) {
  document.querySelectorAll(`[data-line-item="${type}"]`).forEach((row, index) => {
    const legend = row.querySelector("legend");
    if (legend) legend.textContent = t(`staff.${type}.itemLegend`, { number: index + 1 });
  });
}

function updateLiveTotals() {
  const expenseTotal = collectExpenseItems().reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const expenseTarget = document.getElementById("expenseLiveTotal");
  if (expenseTarget) expenseTarget.textContent = formatMoney(expenseTotal);

  const currency = inputValue("invoiceCurrency") || "EUR";
  let invoiceTotal = 0;

  document.querySelectorAll('[data-line-item="invoice"]').forEach((row) => {
    const quantity = Number(row.querySelector('[id^="invoiceQuantity"]')?.value) || 0;
    const unitPrice = Number(row.querySelector('[id^="invoiceUnitPrice"]')?.value) || 0;
    const lineTotal = quantity * unitPrice;
    invoiceTotal += lineTotal;
    const target = row.querySelector("[data-invoice-line-total]");
    if (target) target.textContent = formatMoney(lineTotal, currency);
  });

  const invoiceTarget = document.getElementById("invoiceLiveTotal");
  if (invoiceTarget) invoiceTarget.textContent = formatMoney(invoiceTotal, currency);
}

function isEditableStatus(status) {
  return ["draft", "needs_changes"].includes(String(status || "").toLowerCase());
}

function isReviewableStatus(status) {
  return ["submitted", "under_review"].includes(String(status || "").toLowerCase());
}

function attachmentName(attachment) {
  return attachment.originalName || attachment.filename || attachment.name || t("staff.files.attachment");
}

function formatFileSize(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return "";
  if (size < 1024) return t("staff.files.bytes", { count: size });
  if (size < 1024 * 1024) return t("staff.files.kilobytes", { count: Math.round(size / 1024) });
  return t("staff.files.megabytes", { count: (size / (1024 * 1024)).toFixed(1) });
}

function attachmentsSection(record, editable = false) {
  const attachments = Array.isArray(record.attachments) ? record.attachments : [];
  return `
    <section class="staff-detail-section">
      <div class="staff-section-heading">
        <div>
          <span>${escapeHtml(t("staff.files.eyebrow"))}</span>
          <h2>${escapeHtml(t("staff.files.title"))}</h2>
        </div>
      </div>
      <div class="staff-attachment-list">
        ${attachments.length ? attachments.map((attachment) => `
          <a class="staff-attachment" href="/api/staff/attachments/${encodeURIComponent(attachment.id)}/download" target="_blank" rel="noopener">
            <span class="staff-attachment-icon" aria-hidden="true">▧</span>
            <span>
              <strong>${escapeHtml(attachmentName(attachment))}</strong>
              <small>${escapeHtml(formatFileSize(attachment.size))}</small>
            </span>
            <span aria-hidden="true">↓</span>
          </a>
        `).join("") : `<p class="staff-empty-copy">${escapeHtml(t("staff.files.empty"))}</p>`}
      </div>
      ${editable ? `
        <label class="staff-detail-upload">
          <input
            type="file"
            data-upload-submission="${escapeHtml(record.id)}"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx,application/pdf,image/jpeg,image/png,image/webp"
            multiple
          >
          <span aria-hidden="true">＋</span>
          <span>${escapeHtml(t("staff.files.addMore"))}</span>
        </label>
      ` : ""}
    </section>
  `;
}

function detailActions(record, scope) {
  const editable = isEditableStatus(record.status) && scope !== "review";
  const reviewable = scope === "review" && isReviewableStatus(record.status) && canReview();
  const hasDocument = ["expense", "invoice"].includes(record.type);
  const documentAction = hasDocument && templateAvailable(record.type)
    ? `<a class="staff-button staff-button--secondary" href="/api/staff/submissions/${encodeURIComponent(record.id)}/document" target="_blank" rel="noopener">
         <span aria-hidden="true">↓</span><span>${escapeHtml(t("staff.detail.document"))}</span>
       </a>`
    : hasDocument
      ? `<p class="staff-template-warning staff-template-warning--inline" role="status">${escapeHtml(t(`staff.templates.${record.type}Missing`))}</p>`
      : "";

  if (reviewable) {
    return `
      <div class="staff-review-actions">
        <button class="staff-button staff-button--success" type="button" data-action="open-review" data-decision="approve" data-id="${escapeHtml(record.id)}">
          <span aria-hidden="true">✓</span><span>${escapeHtml(t("staff.review.approve"))}</span>
        </button>
        <button class="staff-button staff-button--warning" type="button" data-action="open-review" data-decision="needs_changes" data-id="${escapeHtml(record.id)}">
          <span aria-hidden="true">↩</span><span>${escapeHtml(t("staff.review.needsChanges"))}</span>
        </button>
        ${documentAction}
      </div>
    `;
  }

  return `
    <div class="staff-detail-actions">
      ${editable ? `
        <button class="staff-button staff-button--ghost" type="button" data-action="edit-submission" data-id="${escapeHtml(record.id)}">
          <span aria-hidden="true">✎</span><span>${escapeHtml(t("staff.detail.edit"))}</span>
        </button>
      ` : ""}
      ${documentAction}
    </div>
  `;
}

function creatorName(record) {
  return record.creator?.name || record.creatorName || record.createdBy?.name || record.creator?.email || record.creatorEmail || "";
}

async function renderDetail(id, scope = "mine") {
  state.view = "detail";
  renderLoading("staff.detail.loading");

  try {
    const payload = await api.getSubmission(id);
    const record = normalizeSubmission(extractSubmission(payload));

    if (!record?.id) throw new ApiError("not_found", 404, payload);
    state.current = record;
    state.editingId = record.id;
    state.formType = record.type;

    const editable = isEditableStatus(record.status) && scope !== "review";
    elements.viewRoot.innerHTML = `
      <section class="staff-detail-view">
        ${pageHeader({
          eyebrow: typeKey(record.type),
          title: `staff.${record.type}.detailTitle`,
          description: "staff.detail.description",
          backView: scope === "review" ? "review" : "mine"
        })}

        <div class="staff-detail-summary">
          <span class="staff-type-icon staff-type-icon--${escapeHtml(record.type)}" aria-hidden="true">
            ${record.type === "news" ? "✦" : record.type === "expense" ? "€" : "↗"}
          </span>
          <div>
            <small>${escapeHtml(t(typeKey(record.type)))}</small>
            <h2>${escapeHtml(submissionTitle(record))}</h2>
            <p>${escapeHtml(t("staff.detail.updated", { date: formatDateTime(record.updatedAt || record.createdAt) }))}</p>
          </div>
          <span class="staff-status staff-status--${escapeHtml(String(record.status).toLowerCase())}">${escapeHtml(t(statusKey(record.status)))}</span>
        </div>

        ${creatorName(record) ? `
          <p class="staff-detail-owner">${escapeHtml(t("staff.detail.createdBy", { name: creatorName(record) }))}</p>
        ` : ""}
        ${reviewBanner(record)}
        ${detailActions(record, scope)}

        <section class="staff-detail-section staff-detail-section--preview">
          <div class="staff-section-heading">
            <div>
              <span>${escapeHtml(t("staff.preview.eyebrow"))}</span>
              <h2>${escapeHtml(t("staff.detail.previewTitle"))}</h2>
            </div>
          </div>
          <div class="staff-preview-canvas">
            ${renderSubmissionPreview(record.type, record.data)}
          </div>
        </section>

        ${attachmentsSection(record, editable)}
      </section>
    `;
    applyTranslations(elements.viewRoot);
  } catch (error) {
    elements.viewRoot.innerHTML = `
      ${pageHeader({
        eyebrow: "staff.detail.eyebrow",
        title: "staff.errors.notFoundTitle",
        description: "staff.errors.notFound",
        backView: scope === "review" ? "review" : "mine"
      })}
      ${inlineError(friendlyErrorKey(error))}
    `;
  }
}

function openReviewDialog(id, decision) {
  state.review.submissionId = id;
  state.review.decision = decision;
  elements.reviewComment.value = "";
  elements.reviewDecisionDescription.textContent = t(`staff.review.decision.${decision}`);
  const commentRequired = decision !== "approve";
  elements.reviewComment.required = commentRequired;
  elements.reviewCommentHint.textContent = t(
    commentRequired ? "staff.review.commentRequired" : "staff.review.commentOptional"
  );
  elements.reviewConfirmButton.className = `staff-button staff-button--${
    decision === "approve" ? "success" : decision === "reject" ? "danger" : "warning"
  }`;
  elements.reviewDialog.showModal();
  elements.reviewComment.focus();
}

function closeReviewDialog() {
  elements.reviewDialog.close();
  state.review.submissionId = null;
  state.review.decision = "";
}

async function confirmReview() {
  const { submissionId, decision } = state.review;
  const comment = elements.reviewComment.value.trim();

  if (!submissionId || !decision) return;

  if (decision !== "approve" && !comment) {
    elements.reviewComment.focus();
    showToast("staff.review.commentRequired", "error");
    return;
  }

  setBusy(elements.reviewConfirmButton, true, "staff.review.saving");

  try {
    await api.reviewSubmission(submissionId, decision, comment);
    closeReviewDialog();
    showToast(`staff.review.success.${decision}`, "success");
    await navigate("review");
  } catch (error) {
    handleError(error);
  } finally {
    setBusy(elements.reviewConfirmButton, false);
  }
}

function auditActionKey(action) {
  const normalized = String(action || "other").trim().toLowerCase();
  const known = new Set([
    "news_created",
    "news_submitted",
    "news_approved",
    "news_returned",
    "expense_created",
    "expense_submitted",
    "expense_approved",
    "expense_returned",
    "expense_notification_sent",
    "expense_notification_failed",
    "invoice_created",
    "invoice_confirmed",
    "login_success",
    "logout"
  ]);
  return `staff.audit.action.${known.has(normalized) ? normalized : "other"}`;
}

async function renderAudit() {
  state.view = "audit";
  elements.viewRoot.innerHTML = `
    <section class="staff-audit-view">
      ${pageHeader({
        eyebrow: "staff.audit.eyebrow",
        title: "staff.audit.title",
        description: "staff.audit.description"
      })}
      <div id="auditList" class="staff-audit-list">
        <div class="staff-inline-loading" role="status">
          <span class="staff-loader" aria-hidden="true"></span>
          <p>${escapeHtml(t("staff.common.loading"))}</p>
        </div>
      </div>
    </section>
  `;

  try {
    const payload = await api.audit();
    const entries = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.entries)
        ? payload.entries
        : Array.isArray(payload?.items)
          ? payload.items
          : [];
    const target = document.getElementById("auditList");
    if (!target) return;

    target.innerHTML = entries.length ? `
      <div class="staff-audit-table-wrap">
        <table class="staff-audit-table">
          <thead>
            <tr>
              <th>${escapeHtml(t("staff.audit.time"))}</th>
              <th>${escapeHtml(t("staff.audit.user"))}</th>
              <th>${escapeHtml(t("staff.audit.actionLabel"))}</th>
              <th>${escapeHtml(t("staff.audit.item"))}</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map((entry) => `
              <tr>
                <td data-label="${escapeHtml(t("staff.audit.time"))}">${escapeHtml(formatDateTime(entry.createdAt || entry.timestamp))}</td>
                <td data-label="${escapeHtml(t("staff.audit.user"))}">${escapeHtml(entry.actorName || entry.actorEmail || entry.user?.email || t("staff.common.notProvided"))}</td>
                <td data-label="${escapeHtml(t("staff.audit.actionLabel"))}"><span class="staff-audit-action">${escapeHtml(t(auditActionKey(entry.action || entry.event)))}</span></td>
                <td data-label="${escapeHtml(t("staff.audit.item"))}">${escapeHtml(entry.resourceType ? t(typeKey(entry.resourceType)) : t("staff.audit.system"))}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    ` : emptyState("staff.audit.emptyTitle", "staff.audit.emptyText");
  } catch (error) {
    const target = document.getElementById("auditList");
    if (target) target.innerHTML = inlineError("staff.errors.auditLoad");
  }
}

function openAiDialog(button) {
  const target = document.getElementById(button.dataset.target || "");
  if (!target) return;

  const text = target.value.trim();

  if (!text) {
    target.focus();
    showToast("staff.ai.emptyText", "error");
    return;
  }

  state.ai.target = target;
  state.ai.field = button.dataset.field || target.name || target.id;
  state.ai.suggestion = "";
  elements.aiOriginal.textContent = text;
  elements.aiSuggestion.textContent = t("staff.ai.suggestionEmpty");
  elements.aiMode.value = button.dataset.mode || "fix_language";
  elements.aiUseButton.disabled = true;
  elements.aiDialog.showModal();
  elements.aiGenerateButton.focus();
}

function closeAiDialog() {
  elements.aiDialog.close();
  state.ai.target = null;
  state.ai.field = "";
  state.ai.suggestion = "";
}

async function generateAiSuggestion() {
  if (!state.ai.target) return;
  const original = state.ai.target.value.trim();

  if (!original) {
    showToast("staff.ai.emptyText", "error");
    return;
  }

  setBusy(elements.aiGenerateButton, true, "staff.ai.working");
  elements.aiSuggestion.textContent = t("staff.ai.working");
  elements.aiUseButton.disabled = true;

  try {
    const payload = await api.improveText({
      text: original,
      field: state.ai.field,
      mode: elements.aiMode.value,
      language: window.I18N?.getLanguage() || "et"
    });
    const suggestion = String(payload?.suggestion || payload?.text || payload?.outputText || "").trim();

    if (!suggestion) {
      throw new ApiError("empty_ai_response", 502, payload);
    }

    state.ai.suggestion = suggestion;
    elements.aiSuggestion.textContent = suggestion;
    elements.aiUseButton.disabled = false;
  } catch (error) {
    elements.aiSuggestion.textContent = t(friendlyErrorKey(error));
    handleError(error);
  } finally {
    setBusy(elements.aiGenerateButton, false);
  }
}

function useAiSuggestion() {
  if (!state.ai.target || !state.ai.suggestion) return;
  const target = state.ai.target;
  target.value = state.ai.suggestion;
  target.dispatchEvent(new Event("input", { bubbles: true }));
  closeAiDialog();
  target.focus();
  showToast("staff.ai.applied", "success");
}

function addLine(type) {
  const container = document.getElementById(type === "expense" ? "expenseItems" : "invoiceItems");
  if (!container) return;
  const uniqueIndex = Date.now();
  container.insertAdjacentHTML(
    "beforeend",
    type === "expense" ? expenseItemRow({}, uniqueIndex) : invoiceItemRow({}, uniqueIndex)
  );
  applyTranslations(container.lastElementChild);
  updateLineLegends(type);
  updateLiveTotals();
  container.lastElementChild?.querySelector("input")?.focus();
}

function removeLine(button) {
  const row = button.closest("[data-line-item]");
  if (!row) return;
  const type = row.dataset.lineItem;
  const rows = document.querySelectorAll(`[data-line-item="${type}"]`);

  if (rows.length <= 1) {
    showToast(`staff.${type}.oneItemRequired`, "error");
    return;
  }

  row.remove();
  updateLineLegends(type);
  updateLiveTotals();
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function updateSelectedFiles(input) {
  const group = input.dataset.fileGroup;
  if (!group) return;
  const files = [...(input.files || [])];
  state.pendingFiles.set(group, files);
  const copy = input.closest(".staff-file-field")?.querySelector(".staff-file-copy small");
  if (copy) {
    copy.textContent = files.length
      ? t("staff.files.selectedCount", { count: files.length })
      : t("staff.files.noneSelected");
  }
}

async function uploadDetailFiles(input) {
  const id = input.dataset.uploadSubmission;
  const files = [...(input.files || [])];
  if (!id || !files.length) return;
  input.disabled = true;

  try {
    for (const file of files) {
      await api.uploadAttachment(id, file, "additional");
    }
    showToast("staff.files.uploaded", "success", { count: files.length });
    await renderDetail(id, "mine");
  } catch (error) {
    handleError(error);
  } finally {
    input.disabled = false;
  }
}

async function editSubmission(id) {
  try {
    let record = state.current?.id === id ? state.current : null;

    if (!record) {
      record = normalizeSubmission(extractSubmission(await api.getSubmission(id)));
    }

    if (!record || !isEditableStatus(record.status)) {
      showToast("staff.errors.notEditable", "error");
      return;
    }

    renderForm(record.type, record);
  } catch (error) {
    handleError(error);
  }
}

async function handleLogout() {
  setBusy(elements.logoutButton, true, "staff.header.loggingOut");

  try {
    await api.logout();
    state.session = null;
    setCsrfToken("");
    resetFormState();
    await loadSession();
  } catch (error) {
    handleError(error, { allowSessionReset: false });
  } finally {
    setBusy(elements.logoutButton, false);
  }
}

async function handleAction(button) {
  const action = button.dataset.action;

  if (action === "navigate") {
    await navigate(button.dataset.view);
    return;
  }

  if (action === "start-form") {
    resetFormState();
    renderForm(button.dataset.type);
    return;
  }

  if (action === "filter-submissions") {
    await renderList(state.listScope, button.dataset.type || "");
    return;
  }

  if (action === "open-submission") {
    await navigate("detail", { id: button.dataset.id, scope: button.dataset.scope });
    return;
  }

  if (action === "save-draft") {
    await saveDraft(button);
    return;
  }

  if (action === "edit-preview") {
    if (state.preview) {
      renderForm(state.preview.type, {
        ...(state.current || {}),
        id: state.editingId,
        type: state.preview.type,
        data: state.preview.data,
        status: state.current?.status || "DRAFT"
      });
    }
    return;
  }

  if (action === "save-preview") {
    await savePreview(button, false);
    return;
  }

  if (action === "submit-preview") {
    await savePreview(button, true);
    return;
  }

  if (action === "add-line") {
    addLine(button.dataset.type);
    return;
  }

  if (action === "remove-line") {
    removeLine(button);
    return;
  }

  if (action === "edit-submission") {
    await editSubmission(button.dataset.id);
    return;
  }

  if (action === "open-review") {
    openReviewDialog(button.dataset.id, button.dataset.decision);
    return;
  }

  if (action === "close-review") {
    closeReviewDialog();
    return;
  }

  if (action === "confirm-review") {
    await confirmReview();
    return;
  }

  if (action === "open-ai") {
    openAiDialog(button);
    return;
  }

  if (action === "close-ai") {
    closeAiDialog();
    return;
  }

  if (action === "generate-ai") {
    await generateAiSuggestion();
    return;
  }

  if (action === "use-ai") {
    useAiSuggestion();
    return;
  }

  if (action === "reload-view") {
    await navigate(state.view === "detail" ? state.listScope : state.view);
  }
}

function attachEvents() {
  document.addEventListener("click", async (event) => {
    const actionButton = event.target.closest("[data-action]");

    if (actionButton) {
      event.preventDefault();
      await handleAction(actionButton);
      return;
    }

    if (
      !elements.userMenu.hidden &&
      !elements.userMenu.contains(event.target) &&
      !elements.userMenuButton.contains(event.target)
    ) {
      elements.userMenu.hidden = true;
      elements.userMenuButton.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("submit", (event) => {
    if (event.target.id !== "submissionForm") return;
    event.preventDefault();

    if (!validateCurrentForm()) return;
    releaseObjectUrls();
    const data = collectFormData();
    renderPreview(state.formType, data);
  });

  document.addEventListener("change", (event) => {
    const target = event.target;

    if (target.matches("[data-file-group]")) {
      updateSelectedFiles(target);
    }

    if (target.matches("[data-upload-submission]")) {
      void uploadDetailFiles(target);
    }

    if (target.id === "invoiceCurrency") {
      updateLiveTotals();
    }
  });

  document.addEventListener("input", (event) => {
    if (
      event.target.matches('[id^="expenseItemAmount"]') ||
      event.target.matches('[id^="invoiceQuantity"]') ||
      event.target.matches('[id^="invoiceUnitPrice"]')
    ) {
      updateLiveTotals();
    }

    if (event.target.id === "newsTitle") {
      const slug = document.getElementById("newsSlug");
      if (slug && (!slug.value || slug.dataset.autoGenerated === "true")) {
        slug.value = slugify(event.target.value);
        slug.dataset.autoGenerated = "true";
      }
    }

    if (event.target.id === "newsSlug") {
      event.target.dataset.autoGenerated = "false";
    }
  });

  elements.userMenuButton.addEventListener("click", () => {
    const open = elements.userMenu.hidden;
    elements.userMenu.hidden = !open;
    elements.userMenuButton.setAttribute("aria-expanded", String(open));
  });

  elements.logoutButton.addEventListener("click", () => void handleLogout());
  elements.deniedRetryButton.addEventListener("click", () => {
    window.history.replaceState(null, "", "/admin");
    void loadSession();
  });

  elements.aiDialog.addEventListener("click", (event) => {
    if (event.target === elements.aiDialog) closeAiDialog();
  });

  elements.reviewDialog.addEventListener("click", (event) => {
    if (event.target === elements.reviewDialog) closeReviewDialog();
  });

  document.addEventListener("i18n:language-changed", () => {
    document.title = t("staff.meta.title");
    configureAuthenticatedShell();

    if (state.view === "home") renderHome();
    else if (state.view === "form" && state.formType) renderForm(state.formType, state.current);
    else if (state.view === "preview" && state.preview) renderPreview(state.preview.type, state.preview.data);
    else if (state.view === "detail" && state.current) {
      void renderDetail(state.current.id, state.listScope);
    }
  });
}

async function init() {
  applyTranslations();
  attachEvents();
  await loadSession();
}

void init();
