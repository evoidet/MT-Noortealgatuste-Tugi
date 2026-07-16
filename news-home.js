/* =========================================================
   NEWS-HOME.JS — UUDISED AINULT AVALEHEL

   Loeb uudised failist news-data.js ja kuvab kolm kaarti
   elemendis #homeNewsList.
   ========================================================= */

(() => {
  "use strict";

  const initHomeNews = () => {
    const target = document.getElementById("homeNewsList");
    const allItems = Array.isArray(window.NEWS_ITEMS)
      ? window.NEWS_ITEMS.filter((item) => item && item.published !== false)
      : [];

    if (!target) return;

    const escapeHtml = (value = "") => String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

    const formatDate = (item) => {
      if (item.displayDate) return item.displayDate;
      if (!item.date) return "Peagi";

      const date = new Date(`${item.date}T12:00:00`);
      if (Number.isNaN(date.getTime())) return item.date;

      return new Intl.DateTimeFormat("et-EE", {
        day: "numeric",
        month: "short",
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

    /* Kui päris uudiseid on alla kolme, täidame ülejäänud kohad näidistega. */
    const items = [...realItems];

    placeholderItems.forEach((item) => {
      if (items.length >= 3) return;
      if (!items.some((existing) => existing.id === item.id)) {
        items.push(item);
      }
    });

    const visibleItems = items.slice(0, 3);

    if (!visibleItems.length) {
      target.innerHTML = `
        <div class="home-news-empty" data-reveal>
          <span>✦</span>
          <h3>Esimene uudis ilmub peagi</h3>
          <p>Lisa esimene uudis faili <strong>news-data.js</strong>.</p>
        </div>
      `;
      return;
    }

    const articleUrl = (item) => (
      `/uudised.html?id=${encodeURIComponent(item.id)}`
    );

    const authorHtml = (item) => {
      const author = typeof item.author === "string" ? item.author.trim() : "";
      return author
        ? `<span class="home-news-author">Autor: ${escapeHtml(author)}</span>`
        : "";
    };

    const imageHtml = (item, className, placeholderText) => `
      <div
        class="${className}"
        data-placeholder="${escapeHtml(placeholderText)}"
      >
        <img
          src="${escapeHtml(item.image || "")}"
          alt="${escapeHtml(item.imageAlt || item.title || "Uudise foto")}"
          loading="lazy"
          decoding="async"
        >
      </div>
    `;

    const featured = visibleItems[0];
    const smallItems = visibleItems.slice(1);

    const featuredHtml = `
      <a
        class="home-news-card home-news-card-featured"
        href="${articleUrl(featured)}"
        data-reveal
        data-tilt
        aria-label="Loe uudist: ${escapeHtml(featured.title)}"
      >
        ${imageHtml(featured, "home-news-media", "Lisa uudise foto")}

        <div class="home-news-featured-overlay">
          <div class="home-news-meta">
            <span class="home-news-category">
              ${escapeHtml(featured.categoryLabel || "Uudised")}
            </span>
            <time>${escapeHtml(formatDate(featured))}</time>
          </div>

          <h3>${escapeHtml(featured.title)}</h3>
          <p>${escapeHtml(featured.excerpt)}</p>
          ${authorHtml(featured)}

          <span class="home-news-card-link">
            ${featured.placeholder ? "Uudis ilmub peagi" : "Loe uudist"}
            <i aria-hidden="true">↗</i>
          </span>
        </div>
      </a>
    `;

    const smallHtml = smallItems.map((item, index) => `
      <a
        class="home-news-card home-news-card-small"
        href="${articleUrl(item)}"
        data-reveal
        data-reveal-delay="${100 + index * 80}"
        data-tilt
        aria-label="Loe uudist: ${escapeHtml(item.title)}"
      >
        ${imageHtml(item, "home-news-small-media", `Foto ${index + 2}`)}

        <div class="home-news-small-content">
          <div class="home-news-meta">
            <span class="home-news-category">
              ${escapeHtml(item.categoryLabel || "Uudised")}
            </span>
            <time>${escapeHtml(formatDate(item))}</time>
          </div>

          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.excerpt)}</p>
          ${authorHtml(item)}

          <span class="home-news-card-link">
            ${item.placeholder ? "Uudis ilmub peagi" : "Loe uudist"}
            <i aria-hidden="true">↗</i>
          </span>
        </div>
      </a>
    `).join("");

    target.innerHTML = `
      ${featuredHtml}
      <div class="home-news-side">${smallHtml}</div>
    `;

    target.querySelectorAll("img").forEach((image) => {
      image.addEventListener("error", () => image.remove(), { once: true });
    });

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const revealItems = target.querySelectorAll("[data-reveal]");

    revealItems.forEach((item) => {
      const delay = Number(item.dataset.revealDelay || 0);
      item.style.setProperty("--reveal-delay", `${delay}ms`);
    });

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
      !reducedMotion &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches
    ) {
      target.querySelectorAll("[data-tilt]").forEach((card) => {
        card.addEventListener("pointermove", (event) => {
          const rect = card.getBoundingClientRect();
          const x = (event.clientX - rect.left) / rect.width;
          const y = (event.clientY - rect.top) / rect.height;

          card.style.setProperty("--tilt-x", `${(y - 0.5) * -5}deg`);
          card.style.setProperty("--tilt-y", `${(x - 0.5) * 5}deg`);
          card.style.setProperty("--shine-x", `${x * 100}%`);
          card.style.setProperty("--shine-y", `${y * 100}%`);
        });

        card.addEventListener("pointerleave", () => {
          card.style.setProperty("--tilt-x", "0deg");
          card.style.setProperty("--tilt-y", "0deg");
        });
      });
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHomeNews, { once: true });
  } else {
    initHomeNews();
  }
})();
