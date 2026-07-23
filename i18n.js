(function (windowObject, documentObject) {
  "use strict";

  const SUPPORTED_LANGUAGES = ["et", "en", "ru"];
  const DEFAULT_LANGUAGE = "et";
  const STORAGE_KEY = "noortetugi.language";
  const translations = windowObject.SITE_TRANSLATIONS || {};

  function isSupportedLanguage(language) {
    return SUPPORTED_LANGUAGES.includes(language);
  }

  function readStoredLanguage() {
    const requestedLanguage = new URLSearchParams(
      windowObject.location.search
    ).get("lang");

    if (isSupportedLanguage(requestedLanguage)) {
      return requestedLanguage;
    }

    try {
      const storedLanguage = windowObject.localStorage.getItem(STORAGE_KEY);
      return isSupportedLanguage(storedLanguage)
        ? storedLanguage
        : DEFAULT_LANGUAGE;
    } catch (error) {
      return DEFAULT_LANGUAGE;
    }
  }

  let currentLanguage = readStoredLanguage();

  function getValue(key, language = currentLanguage) {
    const localizedValue = translations[language]?.[key];

    if (
      localizedValue !== undefined &&
      localizedValue !== null &&
      localizedValue !== ""
    ) {
      return localizedValue;
    }

    const fallbackValue = translations[DEFAULT_LANGUAGE]?.[key];

    if (
      fallbackValue !== undefined &&
      fallbackValue !== null &&
      fallbackValue !== ""
    ) {
      return fallbackValue;
    }

    return "";
  }

  function interpolate(value, variables = {}) {
    if (typeof value !== "string") {
      return value;
    }

    return value.replace(/\{\{(\w+)\}\}/g, function (match, variableName) {
      return Object.prototype.hasOwnProperty.call(variables, variableName)
        ? String(variables[variableName])
        : match;
    });
  }

  function translate(key, variables = {}) {
    return interpolate(getValue(key), variables);
  }

  function setElementText(element, key) {
    const value = translate(key);

    if (typeof value === "string" && value) {
      element.textContent = value;
    }
  }

  function setElementHtml(element, key) {
    const value = translate(key);

    if (typeof value === "string" && value) {
      element.innerHTML = value;
    }
  }

  const ATTRIBUTE_BINDINGS = {
    "data-i18n-alt": "alt",
    "data-i18n-aria-label": "aria-label",
    "data-i18n-content": "content",
    "data-i18n-data-label": "data-label",
    "data-i18n-data-lightbox-caption": "data-lightbox-caption",
    "data-i18n-data-lightbox-kicker": "data-lightbox-kicker",
    "data-i18n-data-photo-credit": "data-photo-credit",
    "data-i18n-data-placeholder": "data-placeholder",
    "data-i18n-placeholder": "placeholder",
    "data-i18n-title": "title"
  };

  function applyTranslations(root = documentObject) {
    const queryRoot =
      root instanceof windowObject.Element
        ? root
        : root instanceof windowObject.DocumentFragment
          ? root
          : documentObject;

    const textElements = [];
    const htmlElements = [];

    if (queryRoot instanceof windowObject.Element) {
      if (queryRoot.matches("[data-i18n]")) {
        textElements.push(queryRoot);
      }

      if (queryRoot.matches("[data-i18n-html]")) {
        htmlElements.push(queryRoot);
      }
    }

    textElements.push(...queryRoot.querySelectorAll("[data-i18n]"));
    htmlElements.push(...queryRoot.querySelectorAll("[data-i18n-html]"));

    textElements.forEach(function (element) {
      setElementText(element, element.dataset.i18n);
    });

    htmlElements.forEach(function (element) {
      setElementHtml(element, element.dataset.i18nHtml);
    });

    Object.entries(ATTRIBUTE_BINDINGS).forEach(function (binding) {
      const dataAttribute = binding[0];
      const targetAttribute = binding[1];
      const elements = [];

      if (
        queryRoot instanceof windowObject.Element &&
        queryRoot.matches(`[${dataAttribute}]`)
      ) {
        elements.push(queryRoot);
      }

      elements.push(...queryRoot.querySelectorAll(`[${dataAttribute}]`));

      elements.forEach(function (element) {
        const key = element.getAttribute(dataAttribute);
        const value = translate(key);

        if (typeof value === "string" && value) {
          element.setAttribute(targetAttribute, value);
        }
      });
    });

    documentObject.documentElement.lang = currentLanguage;
    documentObject.documentElement.dir = "ltr";

    const cssContentBindings = {
      "--i18n-home-hero-route": "home.hero.routeLabel",
      "--i18n-home-news-label": "home.news.backgroundLabel",
      "--i18n-news-hero-label": "newsPage.hero.backgroundLabel",
      "--i18n-network-hero-label": "network.hero.backgroundLabel",
      "--i18n-camp-hero-words": "camp.decor.heroWords",
      "--i18n-camp-idea-to-project": "camp.decor.ideaToProject",
      "--i18n-camp-audience": "camp.decor.audience",
      "--i18n-camp-next": "camp.decor.next",
      "--i18n-camp-your-idea": "camp.decor.yourIdea",
      "--i18n-gala-hero-words": "gala.decor.heroWords",
      "--i18n-street-thank-you": "street.decor.thankYou",
      "--i18n-privacy-hero-words": "privacy.decor.heroWords",
      "--i18n-documents-hero-words": "documents.decor.heroWords"
    };

    Object.entries(cssContentBindings).forEach(function (binding) {
      const value = translate(binding[1]);

      if (value) {
        const escapedValue = value
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"');
        documentObject.documentElement.style.setProperty(
          binding[0],
          `"${escapedValue}"`
        );
      }
    });

    const localeValue = {
      et: "et_EE",
      en: "en_GB",
      ru: "ru_RU"
    }[currentLanguage];

    documentObject
      .querySelectorAll('meta[property="og:locale"]')
      .forEach(function (element) {
        element.setAttribute("content", localeValue);
      });
  }

  function updateLanguageButtons() {
    documentObject
      .querySelectorAll(".lang-button[data-lang]")
      .forEach(function (button) {
        const language = button.dataset.lang;
        const isActive = language === currentLanguage;

        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
        button.disabled = false;
        button.removeAttribute("aria-disabled");
        button.removeAttribute("title");
      });
  }

  function saveLanguage(language) {
    try {
      windowObject.localStorage.setItem(STORAGE_KEY, language);
    } catch (error) {
      // The active language still works for this page when storage is blocked.
    }
  }

  function setLanguage(language, options = {}) {
    const nextLanguage = isSupportedLanguage(language)
      ? language
      : DEFAULT_LANGUAGE;
    const languageChanged = nextLanguage !== currentLanguage;

    currentLanguage = nextLanguage;
    saveLanguage(currentLanguage);
    applyTranslations(documentObject);
    updateLanguageButtons();

    documentObject.dispatchEvent(
      new CustomEvent("i18n:language-changed", {
        detail: {
          language: currentLanguage,
          previousLanguage: languageChanged
            ? options.previousLanguage
            : currentLanguage
        }
      })
    );

    if (options.reload === true && languageChanged) {
      const nextUrl = new URL(windowObject.location.href);

      if (currentLanguage === DEFAULT_LANGUAGE) {
        nextUrl.searchParams.delete("lang");
      } else {
        nextUrl.searchParams.set("lang", currentLanguage);
      }

      windowObject.location.assign(nextUrl.toString());
    }
  }

  function initLanguageSwitcher() {
    documentObject
      .querySelectorAll(".lang-button[data-lang]")
      .forEach(function (button) {
        if (button.dataset.i18nReady === "true") {
          return;
        }

        button.dataset.i18nReady = "true";
        button.addEventListener("click", function () {
          const nextLanguage = button.dataset.lang;

          if (!isSupportedLanguage(nextLanguage)) {
            return;
          }

          const previousLanguage = currentLanguage;
          setLanguage(nextLanguage, {
            previousLanguage,
            reload: true
          });
        });
      });

    updateLanguageButtons();
  }

  function locale() {
    return {
      et: "et-EE",
      en: "en-GB",
      ru: "ru-RU"
    }[currentLanguage];
  }

  function hasUsableNewsValue(value) {
    if (typeof value === "string") {
      return value.trim() !== "";
    }

    if (Array.isArray(value)) {
      return (
        value.length > 0 &&
        value.every(function (entry) {
          return typeof entry === "string" && entry.trim() !== "";
        })
      );
    }

    return value !== undefined && value !== null;
  }

  function localizeNewsItems(items) {
    if (!Array.isArray(items)) {
      return [];
    }

    return items.map(function (item) {
      const localizedContent = getValue(`news.items.${item.id}`);
      const fallbackContent = getValue(
        `news.items.${item.id}`,
        DEFAULT_LANGUAGE
      );

      const localizedFields = (
        localizedContent &&
        typeof localizedContent === "object"
      )
        ? Object.fromEntries(
            Object.entries(localizedContent).filter(function (entry) {
              return hasUsableNewsValue(entry[1]);
            })
          )
        : {};

      return {
        ...item,
        ...(fallbackContent && typeof fallbackContent === "object"
          ? fallbackContent
          : {}),
        ...localizedFields
      };
    });
  }

  windowObject.I18N = {
    DEFAULT_LANGUAGE,
    STORAGE_KEY,
    SUPPORTED_LANGUAGES: [...SUPPORTED_LANGUAGES],
    apply: applyTranslations,
    get: getValue,
    getLanguage: function () {
      return currentLanguage;
    },
    locale,
    localizeNewsItems,
    setLanguage,
    t: translate
  };

  documentObject.documentElement.lang = currentLanguage;

  function initialize() {
    saveLanguage(currentLanguage);
    applyTranslations(documentObject);
    initLanguageSwitcher();
  }

  if (documentObject.readyState === "loading") {
    documentObject.addEventListener("DOMContentLoaded", initialize, {
      once: true
    });
  } else {
    initialize();
  }
})(window, document);
