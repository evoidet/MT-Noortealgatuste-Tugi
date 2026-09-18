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

  // The static catalogue and its translation tooling remain the baseline.
  // Staff articles arrive already localized through the existing public API.
  // Never request authenticated drafts or replace the catalogue on failure.
  windowObject.NEWS_LOAD_STATUS = "unavailable";
  const isPublishedArticle = function (item) {
    return item && item.published === true && typeof item.id === "string" && item.id.trim() &&
      typeof item.title === "string" && item.title.trim() && Array.isArray(item.content) &&
      item.content.some(function (paragraph) { return typeof paragraph === "string" && paragraph.trim(); });
  };
  const mergeArticles = function (published) {
    const merged = new Map(windowObject.NEWS_ITEMS.map(function (item) { return [item.id, item]; }));
    published.filter(isPublishedArticle).forEach(function (item) {
      merged.set(item.id, { ...item, categoryLabel: categoryLabels[item.category] || t("common.nav.news") });
    });
    windowObject.NEWS_ITEMS = [...merged.values()];
  };

  if (typeof windowObject.fetch === "function") {
    const language = windowObject.I18N?.getLanguage() || "et";
    const requestJson = async function (url) {
      // AbortSignal.timeout is not available in every supported browser.
      const controller = typeof windowObject.AbortController === "function"
        ? new windowObject.AbortController() : null;
      const timer = controller
        ? windowObject.setTimeout(function () { controller.abort(); }, 5000) : null;
      try {
        const response = await windowObject.fetch(url, {
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
        let offset = 0;
        while (true) {
          const payload = await requestJson(
            `/api/staff/public/news?lang=${encodeURIComponent(language)}${offset ? `&offset=${offset}` : ""}`
          );
          if (!Array.isArray(payload?.items)) throw new Error("Invalid published news response");
          mergeArticles(payload.items);
          if (payload.nextOffset === undefined || payload.nextOffset === null) break;
          if (!Number.isSafeInteger(payload.nextOffset) || payload.nextOffset <= offset || !payload.items.length) {
            throw new Error("Invalid published news pagination");
          }
          offset = payload.nextOffset;
        }
        windowObject.NEWS_LOAD_STATUS = "ready";
      } catch {
        // Static news stays available during API outages and local/offline use.
        windowObject.NEWS_LOAD_STATUS = "unavailable";
      }

      const articleId = new URLSearchParams(windowObject.location?.search || "").get("id");
      if (!articleId || windowObject.NEWS_ITEMS.some(function (item) { return item.id === articleId; })) return;
      // A listing page can fail while an individual published article is available.
      try {
        const payload = await requestJson(
          `/api/staff/public/news/${encodeURIComponent(articleId)}?lang=${encodeURIComponent(language)}`
        );
        if (!isPublishedArticle(payload?.item) || payload.item.id !== articleId) {
          throw new Error("Invalid published article response");
        }
        mergeArticles([payload.item]);
        windowObject.NEWS_ARTICLE_STATUS = "ready";
      } catch (error) {
        windowObject.NEWS_ARTICLE_STATUS = error.status === 404 ? "missing" : "unavailable";
      }
    })();
  }
})(window);
