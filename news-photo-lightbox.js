(() => {
  "use strict";

  const MEDIA_SELECTOR = [
    ".news-featured-media",
    ".news-card-media",
    ".news-article-image"
  ].join(", ");

  const lightbox = document.createElement("div");

  lightbox.className = "news-photo-lightbox";
  lightbox.hidden = true;
  lightbox.setAttribute("role", "dialog");
  lightbox.setAttribute("aria-modal", "true");
  lightbox.setAttribute("aria-hidden", "true");
  lightbox.setAttribute("aria-labelledby", "newsPhotoLightboxTitle");

  lightbox.innerHTML = `
    <button
      class="news-photo-lightbox-close"
      type="button"
      aria-label="Sulge suur foto"
    >
      <span aria-hidden="true">×</span>
    </button>

    <div class="news-photo-lightbox-card" role="document">
      <div class="news-photo-lightbox-visual">
        <span class="news-photo-lightbox-kicker">UUDISE FOTO</span>

        <img
          class="news-photo-lightbox-image"
          src=""
          alt=""
        >
      </div>

      <div class="news-photo-lightbox-caption">
        <p class="news-photo-lightbox-meta"></p>
        <h2 id="newsPhotoLightboxTitle">Uudise foto</h2>

        <span class="news-photo-lightbox-hint">
          Sulgemiseks vajuta ristile, taustale või klahvile Esc
        </span>
      </div>
    </div>
  `;

  document.body.appendChild(lightbox);

  const lightboxImage = lightbox.querySelector(
    ".news-photo-lightbox-image"
  );
  const lightboxTitle = lightbox.querySelector(
    "#newsPhotoLightboxTitle"
  );
  const lightboxMeta = lightbox.querySelector(
    ".news-photo-lightbox-meta"
  );
  const closeButton = lightbox.querySelector(
    ".news-photo-lightbox-close"
  );

  let lastFocusedMedia = null;
  let closeTimer = null;

  const normalizeText = (value) => {
    return value
      ?.replace(/\s+/g, " ")
      .trim() || "";
  };

  const getPhotoInformation = (media, image) => {
    const featuredCard = media.closest(".news-featured-card");
    const regularCard = media.closest(".news-card");
    const articleView = media.closest(".news-article-view");

    let title = "";
    let meta = "";

    if (featuredCard) {
      title = normalizeText(
        featuredCard.querySelector(
          ".news-featured-content h2"
        )?.textContent
      );

      meta = normalizeText(
        featuredCard.querySelector(
          ".news-card-meta"
        )?.textContent
      );
    }

    if (regularCard) {
      title = normalizeText(
        regularCard.querySelector(
          ".news-card-body h3"
        )?.textContent
      );

      meta = normalizeText(
        regularCard.querySelector(
          ".news-card-meta"
        )?.textContent
      );
    }

    if (articleView) {
      title = normalizeText(
        articleView.querySelector(
          ".news-article-heading h1"
        )?.textContent
      );

      meta = normalizeText(
        articleView.querySelector(
          ".news-article-heading .news-card-meta"
        )?.textContent
      );
    }

    return {
      title:
        title ||
        normalizeText(image.alt) ||
        "Uudise foto",

      meta:
        meta ||
        "MTÜ Noortealgatuste Tugi"
    };
  };

  const openLightbox = (media) => {
    const image = media.querySelector(".news-image-primary, img");

    if (!image || !image.isConnected) {
      return;
    }

    window.clearTimeout(closeTimer);

    const photo = getPhotoInformation(
      media,
      image
    );

    lastFocusedMedia = media;

    lightboxImage.src =
      image.dataset.full ||
      image.currentSrc ||
      image.src;

    lightboxImage.alt =
      image.alt ||
      photo.title;

    lightboxTitle.textContent = photo.title;
    lightboxMeta.textContent = photo.meta;

    lightbox.hidden = false;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        lightbox.classList.add("is-open");
        lightbox.setAttribute(
          "aria-hidden",
          "false"
        );

        document.body.classList.add(
          "news-photo-lightbox-open"
        );

        closeButton.focus({
          preventScroll: true
        });
      });
    });
  };

  const closeLightbox = () => {
    if (!lightbox.classList.contains("is-open")) {
      return;
    }

    lightbox.classList.remove("is-open");
    lightbox.setAttribute(
      "aria-hidden",
      "true"
    );

    document.body.classList.remove(
      "news-photo-lightbox-open"
    );

    closeTimer = window.setTimeout(() => {
      if (lightbox.classList.contains("is-open")) {
        return;
      }

      lightbox.hidden = true;
      lightboxImage.removeAttribute("src");
      lightboxImage.alt = "";
      lightboxTitle.textContent = "Uudise foto";
      lightboxMeta.textContent = "";

      lastFocusedMedia?.focus({
        preventScroll: true
      });
    }, 420);
  };

  const enhanceMedia = (root = document) => {
    const mediaItems = [];

    if (
      root instanceof Element &&
      root.matches(MEDIA_SELECTOR)
    ) {
      mediaItems.push(root);
    }

    if (
      root instanceof Document ||
      root instanceof DocumentFragment ||
      root instanceof Element
    ) {
      mediaItems.push(
        ...root.querySelectorAll(MEDIA_SELECTOR)
      );
    }

    mediaItems.forEach((media) => {
      if (
        media.dataset.newsPhotoReady === "true" ||
        !media.querySelector("img")
      ) {
        return;
      }

      media.dataset.newsPhotoReady = "true";
      media.classList.add("news-photo-openable");
      media.setAttribute("role", "button");
      media.setAttribute("tabindex", "0");
      media.setAttribute("aria-haspopup", "dialog");
      media.setAttribute(
        "aria-label",
        "Ava uudise foto suurelt"
      );
    });
  };

  enhanceMedia();

  const observer = new MutationObserver(
    (mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (
            node instanceof Element ||
            node instanceof DocumentFragment
          ) {
            enhanceMedia(node);
          }
        });
      });
    }
  );

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  document.addEventListener("click", (event) => {
    const media = event.target.closest(
      MEDIA_SELECTOR
    );

    if (
      !media ||
      !media.classList.contains(
        "news-photo-openable"
      )
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    openLightbox(media);
  });

  document.addEventListener("keydown", (event) => {
    const media = event.target.closest?.(
      MEDIA_SELECTOR
    );

    if (
      media &&
      media.classList.contains(
        "news-photo-openable"
      ) &&
      (
        event.key === "Enter" ||
        event.key === " "
      )
    ) {
      event.preventDefault();
      event.stopPropagation();

      openLightbox(media);
      return;
    }

    if (
      event.key === "Escape" &&
      lightbox.classList.contains("is-open")
    ) {
      closeLightbox();
    }
  });

  closeButton.addEventListener(
    "click",
    closeLightbox
  );

  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) {
      closeLightbox();
    }
  });
})();
