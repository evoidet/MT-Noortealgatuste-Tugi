import { readFile } from "node:fs/promises";
import { loadConfig } from "../src/config.js";
import { openDatabase } from "../src/database.js";
import { createGitHubNewsPublisher } from "../src/github-news.js";
import { assertPublishedArticlesPreserved, publishedArticlesForReconciliation } from "../src/news-reconciliation.js";
import { safeOperationalError } from "../src/safe-errors.js";

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some((arg) => !["--apply", "--check"].includes(arg))) {
    throw new Error("Use no argument for dry-run, --check for deployment validation, or --apply for reconciliation.");
  }
  if (!process.env.STORAGE_DATABASE_URL_UNPOOLED) throw new Error("STORAGE_DATABASE_URL_UNPOOLED is required.");
  const database = openDatabase(process.env.STORAGE_DATABASE_URL_UNPOOLED);
  try {
    const articles = await publishedArticlesForReconciliation(database,
      process.env.PUBLIC_SITE_ORIGIN || process.env.APP_URL);
    const catalogue = JSON.parse(await readFile(new URL("../../published-news.json", import.meta.url), "utf8"));
    if (args.includes("--check")) {
      assertPublishedArticlesPreserved(articles, catalogue);
      console.log("Published news preservation check passed.");
    } else if (args.includes("--apply")) {
      const publisher = createGitHubNewsPublisher(loadConfig(), { loadPublishedArticles: async () => articles });
      if (articles.length) await publisher.publish(articles[0], { preserveExisting: true });
      console.log("Published news reconciliation confirmed. Deploy the resulting main commit.");
    } else {
      const ids = new Set(catalogue.map((item) => item.submissionId));
      console.log(`Dry run: ${articles.filter((item) => !ids.has(item.submissionId)).length} published articles missing from the checked-out catalogue. No writes performed.`);
    }
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  console.error("News reconciliation failed:", safeOperationalError(error, "NEWS_RECONCILIATION_FAILED"));
  console.error("Check catalogue conflicts and run news:reconcile -- --apply before deploying the resulting main commit.");
  process.exitCode = 1;
});
