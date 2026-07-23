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
      originalImage: "/assets/news/laager/laager.jpg",
      originalImageWidth: 1080,
      originalImageHeight: 1350,
      featured: false,
      placeholder: false,
      published: true
    },
    {
      id: "avasta-erasmus-voimalused-vitatiimis",
      category: "opportunities",
      date: "2026-07-01",
      image: "/assets/news/erasmus-vitatiim/erasmus-vitatiim.webp",
      imagePosition: "center 30%",
      originalImage: "/assets/news/erasmus-vitatiim/erasmus-vitatiim.jpg",
      originalImageWidth: 1080,
      originalImageHeight: 1350,
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
})(window);
