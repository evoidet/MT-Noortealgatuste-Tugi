/* =========================================================
   NEWS.JS — ERALDI UUDISTE LEHE LOOGIKA

   Funktsioonid:
   - uudiste loend;
   - kategooriafiltrid;
   - otsing;
   - üksiku uudise vaade;
   - seotud uudised;
   - reveal- ja tilt-animatsioonid;
   - kerimisprogress.
   ========================================================= */

(() => {
  "use strict";

  const initNewsPage = () => {
    const page = document.querySelector(".news-page");
    if (!page) return;

    const t = (key, variables) => window.I18N?.t(key, variables) || "";
    const locale = window.I18N?.locale() || "et-EE";
    const currentLanguage = window.I18N?.getLanguage() || "et";

    const allItems = Array.isArray(window.NEWS_ITEMS)
      ? window.NEWS_ITEMS.filter((item) => item && item.published !== false)
      : [];

    const categories = {
      all: t("news.categories.all"),
      achievements: t("news.categories.achievements"),
      events: t("news.categories.events"),
      initiatives: t("news.categories.initiatives"),
      opportunities: t("news.categories.opportunities"),
      ...(window.NEWS_CATEGORIES || {})
    };

    const escapeHtml = (value = "") => String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

    const renderArticleParagraph = (paragraph, index, content) => {
  const text = String(paragraph || "").trim();

  if (!text) return "";

  /* Отдельная ссылка превращается в красивую кнопку */
  if (/^https?:\/\/\S+$/i.test(text)) {
    const previousText = String(content[index - 1] || "").toLowerCase();

    let linkText = t("news.ui.openLink");

    if (/registreer|registration|register|регистрац/i.test(previousText)) {
      linkText = t("news.ui.registerHere");
    }

    if (/kandida|nomination|candidate|кандидат|заявк/i.test(previousText)) {
      linkText = t("news.ui.submitCandidate");
    }

    return `
      <a
        class="news-article-link"
        href="${escapeHtml(text)}"
        target="_blank"
        rel="noopener noreferrer"
      >
        ${linkText}
        <span aria-hidden="true">↗</span>
      </a>
    `;
  }

  /* Короткие строки с двоеточием становятся подзаголовками */
  if (text.length <= 70 && text.endsWith(":")) {
    return `
      <h3 class="news-article-subheading">
        ${escapeHtml(text.slice(0, -1))}
      </h3>
    `;
  }

  return `<p>${escapeHtml(text)}</p>`;
};


    const formatDate = (item) => {
      if (item.displayDate) return item.displayDate;
      if (!item.date) return t("news.ui.soon");

      const date = new Date(`${item.date}T12:00:00`);
      if (Number.isNaN(date.getTime())) return item.date;

      return new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "long",
        year: "numeric"
      }).format(date);
    };

    const sortItems = (items) => [...items].sort((a, b) => {
      if (Boolean(a.featured) !== Boolean(b.featured)) {
        return Number(Boolean(b.featured)) - Number(Boolean(a.featured));
      }

      return String(b.date || "").localeCompare(String(a.date || ""));
    });

    const realItems = sortItems(
      allItems.filter((item) => item.placeholder !== true)
    );

    const placeholderItems = sortItems(
      allItems.filter((item) => item.placeholder === true)
    );

    /* Uudiste lehel kuvame näidiseid ainult seni, kuni päris uudiseid pole. */
    const sourceItems = realItems.length ? realItems : placeholderItems;
    const sortedItems = sortItems(sourceItems);

    const params = new URLSearchParams(window.location.search);
    let activeCategory = params.get("category") || "all";
    let searchValue = params.get("q") || "";
    const articleId = params.get("id");

    if (!Object.prototype.hasOwnProperty.call(categories, activeCategory)) {
      activeCategory = "all";
    }

    const listingView = document.getElementById("newsListingView");
    const articleView = document.getElementById("newsArticleView");
    const featuredTarget = document.getElementById("newsFeatured");
    const gridTarget = document.getElementById("newsGrid");
    const filtersTarget = document.getElementById("newsFilters");
    const searchInput = document.getElementById("newsSearch");
    const resultsText = document.getElementById("newsResultsText");
    const articleTarget = document.getElementById("newsArticleContent");
    const heroCount = document.getElementById("newsHeroCount");

    if (heroCount) {
      heroCount.textContent = String(realItems.length);
    }

    const articleUrl = (item) => (
      `/uudised.html?id=${encodeURIComponent(item.id)}`
    );

    const authorHtml = (item, className = "news-author") => {
      const author = typeof item.author === "string" ? item.author.trim() : "";
      return author
        ? `<span class="${className}">${escapeHtml(
            t("news.ui.author", { author })
          )}</span>`
        : "";
    };

    const imageHtml = (item, className, placeholderText) => `
      <div
        class="${className}"
        data-placeholder="${escapeHtml(placeholderText)}"
      >
        <img
          class="news-image-backdrop"
          src="${escapeHtml(item.image || "")}"
          alt=""
          loading="lazy"
          decoding="async"
          aria-hidden="true"
        >
        <img
          class="news-image-primary"
          src="${escapeHtml(item.image || "")}"
          alt="${escapeHtml(item.imageAlt || item.title || t("news.ui.photo"))}"
          loading="lazy"
          decoding="async"
        >
      </div>
    `;

    const cardHtml = (item, index = 0) => `
      <a
        class="news-card"
        href="${articleUrl(item)}"
        data-news-reveal
        data-news-tilt
        style="--news-delay:${(index % 4) * 70}ms"
        aria-label="${escapeHtml(
          t("news.ui.readLabel", { title: item.title })
        )}"
      >
        ${imageHtml(item, "news-card-media", t("news.ui.addPhoto"))}

        <div class="news-card-body">
          <div class="news-card-meta">
            <span>${escapeHtml(item.categoryLabel || t("common.nav.news"))}</span>
            <time>${escapeHtml(formatDate(item))}</time>
          </div>

          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.excerpt)}</p>
          ${authorHtml(item)}

          <div class="news-card-footer">
            <strong>${item.placeholder
              ? t("news.ui.comingSoon")
              : t("news.ui.readMore")}</strong>
            <i aria-hidden="true">↗</i>
          </div>
        </div>
      </a>
    `;

    const featuredHtml = (item) => `
      <a
        class="news-featured-card"
        href="${articleUrl(item)}"
        data-news-reveal
        data-news-tilt
        aria-label="${escapeHtml(
          t("news.ui.openLabel", { title: item.title })
        )}"
      >
        ${imageHtml(
          item,
          "news-featured-media",
          t("news.ui.addFeaturedPhoto")
        )}

        <div class="news-featured-content">
          <div class="news-card-meta">
            <span>${escapeHtml(item.categoryLabel || t("common.nav.news"))}</span>
            <time>${escapeHtml(formatDate(item))}</time>
          </div>

          <h2>${escapeHtml(item.title)}</h2>
          <p>${escapeHtml(item.excerpt)}</p>
          ${authorHtml(item, "news-featured-author")}

          <div class="news-featured-action">
            <strong>${item.placeholder
              ? t("news.ui.comingSoon")
              : t("news.ui.openNews")}</strong>
            <i aria-hidden="true">→</i>
          </div>
        </div>
      </a>
    `;

    const getFilteredItems = () => sortedItems.filter((item) => {
      const categoryMatch = (
        activeCategory === "all" || item.category === activeCategory
      );

      const needle = searchValue.trim().toLocaleLowerCase(locale);
      if (!needle) return categoryMatch;

      const haystack = [
        item.title,
        item.excerpt,
        item.author,
        item.categoryLabel,
        ...(Array.isArray(item.content) ? item.content : [])
      ]
        .join(" ")
        .toLocaleLowerCase(locale);

      return categoryMatch && haystack.includes(needle);
    });

    const updateUrl = () => {
      const next = new URLSearchParams();

      if (activeCategory !== "all") {
        next.set("category", activeCategory);
      }

      if (searchValue.trim()) {
        next.set("q", searchValue.trim());
      }

      const query = next.toString();
      window.history.replaceState(
        {},
        "",
        `/uudised.html${query ? `?${query}` : ""}`
      );
    };

    const removeBrokenImages = (root = document) => {
      root.querySelectorAll("img").forEach((image) => {
        image.addEventListener("error", () => image.remove(), { once: true });
      });
    };

    const initRevealAndTilt = (root = document) => {
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;

      const revealItems = root.querySelectorAll("[data-news-reveal]");

      if (reducedMotion || !("IntersectionObserver" in window)) {
        revealItems.forEach((item) => item.classList.add("is-visible"));
      } else {
        const observer = new IntersectionObserver(
          (entries, currentObserver) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return;
              entry.target.classList.add("is-visible");
              currentObserver.unobserve(entry.target);
            });
          },
          {
            threshold: 0.12,
            rootMargin: "0px 0px -45px 0px"
          }
        );

        revealItems.forEach((item) => observer.observe(item));
      }

      if (
        reducedMotion ||
        !window.matchMedia("(hover: hover) and (pointer: fine)").matches
      ) {
        return;
      }

      root.querySelectorAll("[data-news-tilt]").forEach((card) => {
        if (card.dataset.newsTiltReady === "true") return;
        card.dataset.newsTiltReady = "true";

        card.addEventListener("pointermove", (event) => {
          const rect = card.getBoundingClientRect();
          const x = (event.clientX - rect.left) / rect.width;
          const y = (event.clientY - rect.top) / rect.height;

          card.style.setProperty(
            "--news-rotate-x",
            `${(y - 0.5) * -4}deg`
          );
          card.style.setProperty(
            "--news-rotate-y",
            `${(x - 0.5) * 4}deg`
          );
          card.style.setProperty("--news-shine-x", `${x * 100}%`);
          card.style.setProperty("--news-shine-y", `${y * 100}%`);
        });

        card.addEventListener("pointerleave", () => {
          card.style.setProperty("--news-rotate-x", "0deg");
          card.style.setProperty("--news-rotate-y", "0deg");
        });
      });
    };

    const renderFilters = () => {
      if (!filtersTarget) return;

      filtersTarget.innerHTML = Object.entries(categories)
        .map(([key, label]) => `
          <button
            type="button"
            class="${key === activeCategory ? "is-active" : ""}"
            data-category="${escapeHtml(key)}"
            aria-pressed="${key === activeCategory ? "true" : "false"}"
          >
            ${escapeHtml(label)}
          </button>
        `)
        .join("");

      filtersTarget.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", () => {
          activeCategory = button.dataset.category || "all";
          updateUrl();
          renderListing();
        });
      });
    };

    const renderListing = () => {
      if (!listingView || !articleView || !featuredTarget || !gridTarget) {
        return;
      }

      listingView.hidden = false;
      articleView.hidden = true;
      document.title = t("newsPage.meta.title");

      renderFilters();

      const items = getFilteredItems();
      const featured = items[0];
      const rest = items.slice(1);

      featuredTarget.innerHTML = featured
        ? featuredHtml(featured)
        : `
          <div class="news-empty-state" data-news-reveal>
            <span>⌕</span>
            <h2>${escapeHtml(t("news.ui.emptyTitle"))}</h2>
            <p>${escapeHtml(t("news.ui.emptyText"))}</p>
          </div>
        `;

      gridTarget.innerHTML = rest.map(cardHtml).join("");

      if (resultsText) {
        const categoryText = categories[activeCategory] || categories.all;
        let resultNoun = t("news.ui.resultMany");

        if (items.length === 1) {
          resultNoun = t("news.ui.resultOne");
        } else if (
          currentLanguage === "ru" &&
          items.length % 10 >= 2 &&
          items.length % 10 <= 4 &&
          (items.length % 100 < 12 || items.length % 100 > 14)
        ) {
          resultNoun = t("news.ui.resultFew");
        }

        resultsText.textContent =
          `${categoryText}: ${items.length} ${resultNoun}`;
      }

      removeBrokenImages(listingView);
      initRevealAndTilt(listingView);
    };

    const renderArticle = (item) => {
      if (!listingView || !articleView || !articleTarget) return;

      listingView.hidden = true;
      articleView.hidden = false;
      document.title = `${item.title} | MTÜ Noortealgatuste Tugi`;

      const content = Array.isArray(item.content) && item.content.length
        ? item.content
        : [item.excerpt];

      const related = sortItems(
        sortedItems.filter((candidate) => candidate.id !== item.id)
      )
        .sort((a, b) => {
          const aSame = a.category === item.category ? 1 : 0;
          const bSame = b.category === item.category ? 1 : 0;
          return bSame - aSame;
        })
        .slice(0, 3);

      articleTarget.innerHTML = `
        <a class="news-article-back" href="/uudised.html">
          <span aria-hidden="true">←</span>
          ${escapeHtml(t("news.ui.back"))}
        </a>

        <div class="news-article-heading" data-news-reveal>
          <div class="news-card-meta">
            <span>${escapeHtml(item.categoryLabel || t("common.nav.news"))}</span>
            <time>${escapeHtml(formatDate(item))}</time>
          </div>

          <h1>${escapeHtml(item.title)}</h1>
          <p>${escapeHtml(item.excerpt)}</p>
          ${authorHtml(item, "news-article-author")}
        </div>

        <div class="news-article-hero" data-news-reveal>
          ${imageHtml(item, "news-article-image", t("news.ui.addPhoto"))}
        </div>

        <div class="news-article-layout">
          <article class="news-article-text" data-news-reveal>
           ${content
            .map((paragraph, index) =>
              renderArticleParagraph(paragraph, index, content)
            )
            .join("")}

            ${item.placeholder ? `
              <div class="news-article-placeholder-note">
                <strong>${escapeHtml(t("news.ui.placeholderTitle"))}</strong>
                <p>
                  ${escapeHtml(t("news.ui.placeholderText"))}
                </p>
              </div>
            ` : ""}
          </article>

          <aside class="news-article-aside" data-news-reveal>
            <span>${escapeHtml(t("news.ui.shareLabel"))}</span>
            <h2>${escapeHtml(t("news.ui.shareTitle"))}</h2>
            <p>
              ${escapeHtml(t("news.ui.shareText"))}
            </p>
            <a href="mailto:juhatus@noortetugi.ee">
              juhatus@noortetugi.ee
            </a>
          </aside>
        </div>

        ${related.length ? `
          <section class="news-related">
            <div class="news-related-heading" data-news-reveal>
              <span>${escapeHtml(t("news.ui.moreLabel"))}</span>
              <h2>${escapeHtml(t("news.ui.moreTitle"))}</h2>
            </div>

            <div class="news-grid">
              ${related.map(cardHtml).join("")}
            </div>
          </section>
        ` : ""}
      `;

      removeBrokenImages(articleView);
      initRevealAndTilt(articleView);
    };

    if (searchInput) {
      searchInput.value = searchValue;

      let searchTimer = null;
      searchInput.addEventListener("input", () => {
        window.clearTimeout(searchTimer);

        searchTimer = window.setTimeout(() => {
          searchValue = searchInput.value.trim();
          updateUrl();
          renderListing();
        }, 140);
      });
    }

    const selectedArticle = articleId
      ? allItems.find((item) => item.id === articleId)
      : null;

    if (selectedArticle) {
      renderArticle(selectedArticle);
    } else {
      renderListing();
    }

    /* Hero valgus */
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const hero = document.querySelector(".news-hero");

    if (hero && !reducedMotion) {
      hero.addEventListener("pointermove", (event) => {
        const rect = hero.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 100;
        const y = ((event.clientY - rect.top) / rect.height) * 100;

        hero.style.setProperty("--news-pointer-x", `${x}%`);
        hero.style.setProperty("--news-pointer-y", `${y}%`);
      });
    }

    /* Kerimisprogress */
    if (!document.querySelector(".news-scroll-progress")) {
      const progress = document.createElement("div");
      progress.className = "news-scroll-progress";
      progress.setAttribute("aria-hidden", "true");
      document.body.appendChild(progress);

      const updateProgress = () => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const value = max > 0 ? (window.scrollY / max) * 100 : 0;

        progress.style.setProperty(
          "--news-progress",
          `${Math.max(0, Math.min(100, value))}%`
        );
      };

      updateProgress();
      window.addEventListener("scroll", updateProgress, { passive: true });
      window.addEventListener("resize", updateProgress);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNewsPage, { once: true });
  } else {
    initNewsPage();
  }
})();
