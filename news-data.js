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
  if (typeof windowObject.fetch === "function") {
    const language = windowObject.I18N?.getLanguage() || "et";
    windowObject.NEWS_READY = windowObject.fetch(
      `/api/staff/public/news?lang=${encodeURIComponent(language)}`,
      { credentials: "omit", signal: windowObject.AbortSignal.timeout(5000) }
    ).then(function (response) {
      if (!response.ok) throw new Error("Published news unavailable");
      return response.json();
    }).then(function (payload) {
      const published = Array.isArray(payload.items) ? payload.items.filter(function (item) {
        return item && item.published === true && typeof item.id === "string" &&
          item.title && item.excerpt && Array.isArray(item.content);
      }) : [];
      const merged = new Map(windowObject.NEWS_ITEMS.map(function (item) { return [item.id, item]; }));
      published.forEach(function (item) {
        merged.set(item.id, { ...item, categoryLabel: categoryLabels[item.category] || t("common.nav.news") });
      });
      windowObject.NEWS_ITEMS = [...merged.values()];
    }).catch(function () {
      // Static news stays available during API outages and local/offline use.
    });
  }
})(window);
