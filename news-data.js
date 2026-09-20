/* =========================================================
   NEWS-DATA.JS — SHARED NEWS DATA

   This file stores language-neutral publishing data only.
   Titles, dates, descriptions, image text and article content live in
   translations.js under news.items.<article-id>.

   Categories:
   achievements  = achievements
   events        = events
   initiatives   = youth initiatives
   opportunities = opportunities

   Image rules:
   - `image` is a landscape news cover between 3:2 and 8:5
     (minimum size: 1200 x 750).
   - `imageFit: "contain"` is reserved for intentional portrait posters.
   - `originalImage` may keep any aspect ratio and is shown inside the article.
   ========================================================= */

(function (windowObject) {
  "use strict";

  const t = function (key) {
    return windowObject.I18N?.t(key) || "";
  };

  const categoryLabels = {
    all: t("news.categories.all"),
    achievements: t("news.categories.achievements"),
    events: t("news.categories.events"),
    initiatives: t("news.categories.initiatives"),
    opportunities: t("news.categories.opportunities")
  };

  const items = [
    {
      id: "ida-virumaa-noorte-tunnustusgala-toimub-taas",
      category: "events",
      date: "2026-06-28",
      image: "/assets/news/tunnustusgala/tunnustusgala-2026.webp",
      imagePosition: "center center",
      featured: true,
      placeholder: false,
      published: true
    },
    {
      id: "projektikirjutamise-laager-toimub-esmakordselt",
      category: "events",
      date: "2026-06-28",
      image: "/assets/news/laager/laager.jpg",
      imagePosition: "center 24%",
      featured: false,
      placeholder: false,
      published: true
    },
    {
      id: "avasta-erasmus-voimalused-vitatiimis",
      category: "opportunities",
      date: "2026-07-01",
      image: "/assets/news/erasmus-vitatiim/erasmus-vitatiim.jpg",
      imagePosition: "center center",
      featured: false,
      placeholder: false,
      published: true
    },
    {
      id: "narvas-toimus-koolitus-erasmus-ja-rohkem-avasta-mis-euroopa-sulle-pakub",
      category: "events",
      date: "2026-07-16",
      image: "/assets/news/erasmus-vitatiim/erasmus-koolitus.jpg",
      imagePosition: "center 62%",
      featured: false,
      placeholder: false,
      published: true
    }
  ];

  windowObject.NEWS_CATEGORIES = categoryLabels;
  windowObject.NEWS_ITEMS = windowObject.I18N
    ? windowObject.I18N.localizeNewsItems(items).map(function (item) {
        return {
          ...item,
          categoryLabel:
            categoryLabels[item.category] || t("common.nav.news")
        };
      })
    : items;

  // Repository content is the public source of truth. Legacy hand-authored
  // entries above and staff-published entries in published-news.json are both
  // deployed from main; PostgreSQL is not queried for article content.
  windowObject.NEWS_LOAD_STATUS = "unavailable";
  const isPublishedArticle = function (item) {
    return item && item.published === true && typeof item.id === "string" && item.id.trim() &&
      typeof item.title === "string" && item.title.trim() && Array.isArray(item.content) &&
      item.content.some(function (paragraph) { return typeof paragraph === "string" && paragraph.trim(); });
  };
  const localizedRepositoryArticle = function (article, language) {
    const source = article?.translations?.[article.sourceLanguage] || article;
    const localized = article?.translations?.[language] || {};
    return { ...article, ...source, ...localized, translations: undefined };
  };
  const mergeArticles = function (published) {
    const merged = new Map(windowObject.NEWS_ITEMS.map(function (item) { return [item.id, item]; }));
    published.filter(isPublishedArticle).forEach(function (item) {
      const existing = merged.get(item.id);
      if (existing && existing.submissionId !== item.submissionId) return;
      merged.set(item.id, { ...item, categoryLabel: categoryLabels[item.category] || t("common.nav.news") });
    });
    windowObject.NEWS_ITEMS = [...merged.values()];
  };

  if (typeof windowObject.fetch === "function") {
    const language = windowObject.I18N?.getLanguage() || "et";
    const requestJson = async function () {
      // AbortSignal.timeout is not available in every supported browser.
      const controller = typeof windowObject.AbortController === "function"
        ? new windowObject.AbortController() : null;
      const timer = controller
        ? windowObject.setTimeout(function () { controller.abort(); }, 5000) : null;
      try {
        const response = await windowObject.fetch("/published-news.json", {
          credentials: "omit",
          signal: controller?.signal || windowObject.AbortSignal?.timeout?.(5000)
        });
        if (!response.ok) throw Object.assign(new Error("Published news unavailable"), { status: response.status });
        return await response.json();
      } finally {
        if (timer !== null) windowObject.clearTimeout(timer);
      }
    };
    windowObject.NEWS_LOAD_STATUS = "loading";
    windowObject.NEWS_READY = (async function () {
      try {
        const payload = await requestJson();
        if (!Array.isArray(payload)) throw new Error("Invalid repository news response");
        mergeArticles(payload.map(function (article) {
          return localizedRepositoryArticle(article, language);
        }));
        windowObject.NEWS_LOAD_STATUS = "ready";
      } catch {
        // Legacy static news stays available during deployment/CDN failures.
        windowObject.NEWS_LOAD_STATUS = "unavailable";
      }

      const articleId = new URLSearchParams(windowObject.location?.search || "").get("id");
      if (!articleId) return;
      windowObject.NEWS_ARTICLE_STATUS = windowObject.NEWS_ITEMS.some(function (item) {
        return item.id === articleId;
      }) ? "ready" : windowObject.NEWS_LOAD_STATUS === "ready" ? "missing" : "unavailable";
    })();
  }
})(window);
