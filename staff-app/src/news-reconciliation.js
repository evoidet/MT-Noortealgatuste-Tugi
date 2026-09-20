import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { toRepositoryNewsItem } from "./news-publishing.js";

// Use the actual legacy catalogue rather than a second, drifting slug list.
/** @type {{ NEWS_ITEMS?: Array<{id: string}> }} */
const window = {};
vm.runInNewContext(await readFile(new URL("../../news-data.js", import.meta.url), "utf8"),
  { window }, { timeout: 1000 });
export const legacyNewsSlugs = new Set(window.NEWS_ITEMS.map((item) => item.id));

export async function publishedArticlesForReconciliation(database, publicSiteOrigin) {
  const submissions = await database.listNewsForReconciliation();
  return Promise.all(submissions.map(async (submission) =>
    toRepositoryNewsItem(submission, await database.listAttachments(submission.id), publicSiteOrigin)));
}

export function assertPublishedArticlesPreserved(articles, catalogue) {
  if (!Array.isArray(catalogue)) throw new Error("The repository news catalogue must be an array.");
  const ids = new Set(catalogue.map((item) => item.submissionId));
  if (articles.some((article) => !ids.has(article.submissionId))) {
    throw new Error("Published news is missing from the repository catalogue. Run news:reconcile -- --apply, then deploy the resulting main commit.");
  }
}
