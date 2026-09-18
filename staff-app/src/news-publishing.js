const supportedLanguages = new Set(["et", "en", "ru"]);

function usable(value) {
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) {
    return value.length > 0 && value.every((entry) => typeof entry === "string" && entry.trim() !== "");
  }
  return value !== undefined && value !== null;
}

function localizedValue(primary, fallback, localized, key) {
  if (usable(localized?.[key])) return localized[key];
  if (usable(fallback?.[key])) return fallback[key];
  return primary[key];
}

function paragraphs(value) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\n\s*\n/) : [];
  return values.filter((entry) => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean);
}

function publicationDate(value, submission) {
  const date = typeof value === "string" ? value.trim() : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date) return date;
  }
  for (const timestamp of [submission.publishedAt, submission.createdAt]) {
    const parsed = timestamp ? new Date(timestamp) : null;
    if (parsed && !Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return "";
}

function safePublicImageUrl(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (text.startsWith("/") && !text.startsWith("//")) return text;
  try {
    const url = new URL(text);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

function safePublicExternalUrl(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}

function attachmentUrl(submissionId, attachmentId) {
  return `/api/staff/public/news/${encodeURIComponent(submissionId)}/attachments/${encodeURIComponent(attachmentId)}`;
}

export function normalizeNewsLanguage(value) {
  return supportedLanguages.has(value) ? value : "et";
}

export function toPublicNewsItem(submission, attachments = [], requestedLanguage = "et") {
  if (!submission || submission.type !== "news" || submission.status !== "PUBLISHED") return null;
  const data = submission.data ?? {};
  const language = normalizeNewsLanguage(requestedLanguage);
  const translations = data.translations ?? {};
  const sourceLanguage = normalizeNewsLanguage(data.language);
  // The source article is already in its declared language. An Estonian
  // translation must not replace it when that original language is requested.
  const fallback = language === sourceLanguage || sourceLanguage === "et" ? data : translations.et ?? {};
  const localized = language === sourceLanguage ? {} : translations[language] ?? {};
  const primary = attachments.find((entry) => entry.kind === "primary" && entry.storageStatus === "ready");
  const additional = attachments.filter((entry) =>
    entry.kind !== "primary" && entry.storageStatus === "ready"
  );
  const image = primary
    ? attachmentUrl(submission.id, primary.id)
    : safePublicImageUrl(data.image);

  return {
    id: typeof data.slug === "string" && data.slug.trim() ? data.slug.trim() : `news-${submission.id}`,
    category: data.category || "events",
    date: publicationDate(data.date, submission),
    image,
    imagePosition: data.imagePosition || "center center",
    imageFit: data.imageFit === "contain" ? "contain" : "cover",
    originalImage: additional[0] ? attachmentUrl(submission.id, additional[0].id) : "",
    additionalImages: additional.map((attachment) => attachmentUrl(submission.id, attachment.id)),
    featured: data.featured === true || data.featured === "true",
    placeholder: false,
    published: true,
    title: localizedValue(data, fallback, localized, "title"),
    excerpt: localizedValue(data, fallback, localized, "excerpt") || data.summary || "",
    imageAlt: localizedValue(data, fallback, localized, "imageAlt") || data.imageAlt,
    displayDate: localizedValue(data, fallback, localized, "displayDate") || "",
    content: paragraphs(localizedValue(data, fallback, localized, "content") || data.content),
    author: data.author,
    authorRole: data.authorRole,
    project: data.project,
    registrationUrl: safePublicExternalUrl(data.registrationUrl)
  };
}
