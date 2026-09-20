import { legacyNewsSlugs } from "./news-reconciliation.js";

const NEWS_CONTENT_PATH = "published-news.json";
const MAX_COMMIT_ATTEMPTS = 4;

export class GitHubNewsError extends Error {
  /** @param {{ status?: number, cause?: unknown }} options */
  constructor(code, message, options = {}) {
    const { status = 502, cause } = options;
    super(message, cause ? { cause } : undefined);
    this.name = "GitHubNewsError";
    this.code = code;
    this.status = status;
    this.operation = "news_publish";
  }
}

function encodeContent(value) {
  return Buffer.from(value, "utf8").toString("base64");
}

function decodeContent(value) {
  return Buffer.from(String(value || "").replace(/\s/g, ""), "base64").toString("utf8");
}

function canonicalJson(items) {
  return `${JSON.stringify(items, null, 2)}\n`;
}

function validArticle(value) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    typeof value.submissionId === "string" && /^[0-9a-f-]{36}$/i.test(value.submissionId) &&
    typeof value.id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id);
}

function parseCatalogue(source) {
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (cause) {
    throw new GitHubNewsError("GITHUB_NEWS_FILE_INVALID",
      "The repository news catalogue is not valid JSON.", { cause });
  }
  if (!Array.isArray(parsed) || !parsed.every(validArticle)) {
    throw new GitHubNewsError("GITHUB_NEWS_FILE_INVALID",
      "The repository news catalogue has an invalid structure.");
  }
  const submissions = new Set();
  const slugs = new Set();
  for (const item of parsed) {
    if (submissions.has(item.submissionId) || slugs.has(item.id)) {
      throw new GitHubNewsError("GITHUB_NEWS_FILE_INVALID",
        "The repository news catalogue contains duplicate identifiers.");
    }
    submissions.add(item.submissionId);
    slugs.add(item.id);
  }
  return parsed;
}

function upsertArticle(items, article) {
  if (!validArticle(article)) {
    throw new GitHubNewsError("NEWS_EXPORT_INVALID", "The generated news article is invalid.", { status: 422 });
  }
  const slugOwner = items.find((item) => item.id === article.id && item.submissionId !== article.submissionId);
  if (slugOwner || legacyNewsSlugs.has(article.id)) {
    throw new GitHubNewsError("NEWS_SLUG_CONFLICT", "The news URL slug is already in use.", { status: 409 });
  }
  const index = items.findIndex((item) => item.submissionId === article.submissionId);
  const next = [...items];
  const operation = index === -1 ? "add" : "update";
  if (index === -1) next.push(article);
  else next[index] = article;
  next.sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")) ||
    left.id.localeCompare(right.id));
  return { items: next, operation, unchanged: canonicalJson(next) === canonicalJson(items) };
}

function safeResponseCode(status) {
  if (status === 401 || status === 403) return "GITHUB_AUTHENTICATION_FAILED";
  if (status === 404) return "GITHUB_REPOSITORY_NOT_FOUND";
  if (status === 409) return "GITHUB_CONFLICT";
  if (status === 422) return "GITHUB_DIRECT_COMMIT_REJECTED";
  if (status === 429) return "GITHUB_RATE_LIMITED";
  return "GITHUB_PUBLISH_FAILED";
}

function safeResponseMessage(status) {
  if (status === 401 || status === 403) return "GitHub rejected the publishing credentials or repository permission.";
  if (status === 404) return "The configured GitHub repository or news file was not found.";
  if (status === 422) return "GitHub rejected a direct commit to main. Check repository rules and token permissions.";
  if (status === 429) return "GitHub rate-limited the publishing request. Please retry.";
  return "GitHub could not publish the news article. Please retry.";
}

export function createGitHubNewsPublisher(config, {
  fetchImpl = globalThis.fetch,
  loadPublishedArticles = async () => []
} = {}) {
  const repository = String(config.githubRepository || "");
  const branch = String(config.githubBranch || "main");
  const token = String(config.githubToken || "");
  const apiBase = String(config.githubApiUrl || "https://api.github.com").replace(/\/$/, "");
  const contentUrl = `${apiBase}/repos/${repository}/contents/${NEWS_CONTENT_PATH}`;
  const headers = Object.freeze({
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "noortetugi-news-publisher"
  });

  async function request(url, options = {}) {
    let response;
    try {
      response = await fetchImpl(url, { ...options, headers: { ...headers, ...(options.headers || {}) },
        signal: options.signal || AbortSignal.timeout(15_000) });
    } catch (cause) {
      throw new GitHubNewsError("GITHUB_NETWORK_ERROR", "GitHub could not be reached. Please retry.", { cause });
    }
    let payload = null;
    if (response.status !== 204) {
      try { payload = await response.json(); } catch { payload = null; }
    }
    return { response, payload };
  }

  async function readCatalogue() {
    const url = `${contentUrl}?ref=${encodeURIComponent(branch)}`;
    const { response, payload } = await request(url, { method: "GET" });
    if (response.status === 404) return { items: [], sha: null };
    if (!response.ok || !payload || typeof payload.content !== "string" || typeof payload.sha !== "string") {
      throw new GitHubNewsError(safeResponseCode(response.status), safeResponseMessage(response.status),
        { status: response.status >= 400 && response.status < 500 ? 502 : 503 });
    }
    return { items: parseCatalogue(decodeContent(payload.content)), sha: payload.sha };
  }

  async function publish(article, { preserveExisting = false } = {}) {
    // This snapshot only fills missing UUIDs. Repository edits always win over
    // stale database copies, including after a concurrent SHA retry.
    const published = await loadPublishedArticles();
    for (let attempt = 1; attempt <= MAX_COMMIT_ATTEMPTS; attempt += 1) {
      const current = await readCatalogue();
      let imported = current.items;
      for (const previous of published) {
        if (!imported.some((item) => item.submissionId === previous.submissionId)) {
          imported = upsertArticle(imported, previous).items;
        }
      }
      const existing = imported.find((item) => item.submissionId === article.submissionId);
      const merged = upsertArticle(imported, preserveExisting && existing ? existing : article);
      merged.unchanged = canonicalJson(merged.items) === canonicalJson(current.items);
      if (merged.unchanged) return { published: true, unchanged: true, operation: merged.operation, path: NEWS_CONTENT_PATH };
      const message = `${merged.operation === "add" ? "Add" : "Update"} news: ${article.title}`.slice(0, 250);
      const { response, payload } = await request(contentUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, branch, content: encodeContent(canonicalJson(merged.items)),
          ...(current.sha ? { sha: current.sha } : {}) })
      });
      if (response.ok && payload?.commit?.sha) {
        return { published: true, unchanged: false, operation: merged.operation,
          path: NEWS_CONTENT_PATH, commitSha: payload.commit.sha };
      }
      if ([409, 422].includes(response.status) && attempt < MAX_COMMIT_ATTEMPTS) continue;
      throw new GitHubNewsError(safeResponseCode(response.status), safeResponseMessage(response.status),
        { status: response.status >= 400 && response.status < 500 ? 502 : 503 });
    }
    throw new GitHubNewsError("GITHUB_CONFLICT", "The news catalogue changed repeatedly. Please retry.", { status: 409 });
  }

  return Object.freeze({ publish, readCatalogue, path: NEWS_CONTENT_PATH, branch, repository });
}

export const __githubNewsTestUtils = Object.freeze({ parseCatalogue, upsertArticle, canonicalJson });
