import vm from "node:vm";

export const LANGUAGES = ["et", "en", "ru"];
export const TARGET_LANGUAGES = ["en", "ru"];
export const TRANSLATABLE_FIELDS = [
  "title",
  "excerpt",
  "imageAlt",
  "content"
];

const ALLOWED_HTML_TAGS = new Set([
  "p",
  "h2",
  "h3",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "a",
  "br",
  "blockquote"
]);

const SAFE_GLOBAL_ATTRIBUTES = new Set(["class", "id", "title"]);
const SAFE_LINK_ATTRIBUTES = new Set(["href", "target", "rel"]);

const clone = (value) => JSON.parse(JSON.stringify(value));

const isPlainObject = (value) => (
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value)
);

export function loadTranslationCatalog(source) {
  const sandbox = { window: {} };

  vm.runInNewContext(source, sandbox, {
    filename: "translations.js",
    timeout: 1_000
  });

  const catalog = sandbox.window.SITE_TRANSLATIONS;

  if (!isPlainObject(catalog)) {
    throw new Error("translations.js did not expose SITE_TRANSLATIONS.");
  }

  LANGUAGES.forEach((language) => {
    if (!isPlainObject(catalog[language])) {
      throw new Error(
        `translations.js is missing the ${language} translation catalogue.`
      );
    }
  });

  return catalog;
}

export function loadNewsItems(source) {
  const sandbox = {
    window: {
      I18N: {
        localizeNewsItems: (items) => items,
        t: () => ""
      }
    }
  };

  vm.runInNewContext(source, sandbox, {
    filename: "news-data.js",
    timeout: 1_000
  });

  const items = sandbox.window.NEWS_ITEMS;

  if (!Array.isArray(items)) {
    throw new Error("news-data.js did not expose NEWS_ITEMS.");
  }

  const ids = new Set();

  items.forEach((item) => {
    if (!isPlainObject(item) || typeof item.id !== "string" || !item.id.trim()) {
      throw new Error("Every news item must have a non-empty string ID.");
    }

    if (ids.has(item.id)) {
      throw new Error(`Duplicate news ID: ${item.id}`);
    }

    ids.add(item.id);
  });

  return items;
}

export function getEntryValues(catalog, itemId) {
  const key = `news.items.${itemId}`;
  const values = LANGUAGES.map((language) => catalog[language][key]);

  if (!isPlainObject(values[0])) {
    throw new Error(
      `Missing Estonian source object for "${itemId}" in translations.js.`
    );
  }

  return values.map((value, index) => {
    if (value === undefined || value === null || value === "") {
      return {};
    }

    if (!isPlainObject(value)) {
      throw new Error(
        `The ${LANGUAGES[index]} value for "${itemId}" must be an object.`
      );
    }

    return clone(value);
  });
}

function isMissing(value, sourceValue) {
  if (Array.isArray(sourceValue)) {
    return (
      !Array.isArray(value) ||
      value.length !== sourceValue.length ||
      value.some((entry) => (
        typeof entry !== "string" || entry.trim() === ""
      ))
    );
  }

  return typeof value !== "string" || value.trim() === "";
}

export function buildTranslationRequests(entryValues, force = false) {
  const source = entryValues[0];
  const requests = {};

  TRANSLATABLE_FIELDS.forEach((field) => {
    const value = source[field];

    if (
      (typeof value !== "string" || value.trim() === "") &&
      (!Array.isArray(value) || value.length === 0)
    ) {
      throw new Error(`Estonian source field "${field}" is empty.`);
    }
  });

  TARGET_LANGUAGES.forEach((language) => {
    const targetIndex = LANGUAGES.indexOf(language);
    const target = entryValues[targetIndex] || {};
    const fields = TRANSLATABLE_FIELDS.filter((field) => (
      force || isMissing(target[field], source[field])
    ));

    if (fields.length) {
      requests[language] = fields;
    }
  });

  return requests;
}

function extractUrls(value) {
  const text = Array.isArray(value) ? value.join("\n") : String(value || "");
  return text.match(/https?:\/\/[^\s<>"']+/gi) || [];
}

function tagSignature(value) {
  return [...String(value || "").matchAll(/<\/?([a-z][\w-]*)\b[^>]*>/gi)]
    .map((match) => match[0].startsWith("</")
      ? `/${match[1].toLowerCase()}`
      : match[1].toLowerCase());
}

function validateHtml(value, fieldLabel) {
  const text = String(value);

  if (
    /<\s*(script|style|iframe|object|embed|form|input|svg)\b/i.test(text) ||
    /\bon[a-z]+\s*=/i.test(text) ||
    /\bsrcdoc\s*=/i.test(text) ||
    /\bstyle\s*=/i.test(text) ||
    /javascript\s*:/i.test(text)
  ) {
    throw new Error(`${fieldLabel} contains unsafe HTML.`);
  }

  const tags = [...text.matchAll(/<\/?([a-z][\w-]*)(\s[^<>]*?)?>/gi)];

  tags.forEach((match) => {
    const tagName = match[1].toLowerCase();

    if (!ALLOWED_HTML_TAGS.has(tagName)) {
      throw new Error(`${fieldLabel} contains disallowed <${tagName}> HTML.`);
    }

    if (match[0].startsWith("</")) {
      return;
    }

    const attributeText = match[2] || "";
    const attributes = [
      ...attributeText.matchAll(
        /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
      )
    ];

    attributes.forEach((attribute) => {
      const name = attribute[1].toLowerCase();
      const allowed = SAFE_GLOBAL_ATTRIBUTES.has(name) || (
        tagName === "a" && SAFE_LINK_ATTRIBUTES.has(name)
      );

      if (!allowed) {
        throw new Error(
          `${fieldLabel} contains disallowed HTML attribute "${name}".`
        );
      }

      if (tagName === "a" && name === "href") {
        const href = attribute[2] ?? attribute[3] ?? attribute[4] ?? "";

        if (
          href &&
          !/^(https?:|mailto:|tel:|\/|#)/i.test(href)
        ) {
          throw new Error(`${fieldLabel} contains an unsafe link URL.`);
        }
      }
    });
  });
}

function validateFieldTranslation(sourceValue, translatedValue, fieldLabel) {
  if (Array.isArray(sourceValue)) {
    if (
      !Array.isArray(translatedValue) ||
      translatedValue.length !== sourceValue.length
    ) {
      throw new Error(
        `${fieldLabel} must be an array with ${sourceValue.length} entries.`
      );
    }

    translatedValue.forEach((entry, index) => {
      if (typeof entry !== "string" || entry.trim() === "") {
        throw new Error(`${fieldLabel}[${index}] must be a non-empty string.`);
      }

      validateHtml(entry, `${fieldLabel}[${index}]`);

      if (
        JSON.stringify(tagSignature(entry)) !==
        JSON.stringify(tagSignature(sourceValue[index]))
      ) {
        throw new Error(`${fieldLabel}[${index}] changed the HTML structure.`);
      }

      extractUrls(sourceValue[index]).forEach((url) => {
        if (!entry.includes(url)) {
          throw new Error(`${fieldLabel}[${index}] changed the URL ${url}`);
        }
      });
    });

    return;
  }

  if (typeof translatedValue !== "string" || translatedValue.trim() === "") {
    throw new Error(`${fieldLabel} must be a non-empty string.`);
  }

  validateHtml(translatedValue, fieldLabel);

  if (
    JSON.stringify(tagSignature(translatedValue)) !==
    JSON.stringify(tagSignature(sourceValue))
  ) {
    throw new Error(`${fieldLabel} changed the HTML structure.`);
  }

  extractUrls(sourceValue).forEach((url) => {
    if (!translatedValue.includes(url)) {
      throw new Error(`${fieldLabel} changed the URL ${url}`);
    }
  });
}

export function validateTranslationPayload(payload, requests, source) {
  if (!isPlainObject(payload) || !isPlainObject(payload.translations)) {
    throw new Error('API response must contain a "translations" object.');
  }

  Object.entries(requests).forEach(([language, fields]) => {
    const translation = payload.translations[language];

    if (!isPlainObject(translation)) {
      throw new Error(`API response is missing the ${language} translation.`);
    }

    fields.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(translation, field)) {
        throw new Error(
          `API response is missing ${language}.${field}.`
        );
      }

      validateFieldTranslation(
        source[field],
        translation[field],
        `${language}.${field}`
      );
    });
  });

  return payload;
}

function formatDisplayDate(dateValue, language) {
  if (!dateValue) {
    return "";
  }

  const date = new Date(`${dateValue}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return String(dateValue);
  }

  const locale = {
    et: "et-EE",
    en: "en-GB",
    ru: "ru-RU"
  }[language];

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

export function mergeTranslationPayload(
  entryValues,
  item,
  payload,
  requests
) {
  const nextValues = clone(entryValues);

  Object.entries(requests).forEach(([language, fields]) => {
    const languageIndex = LANGUAGES.indexOf(language);
    const target = nextValues[languageIndex] || {};
    const translated = payload.translations[language];

    fields.forEach((field) => {
      target[field] = clone(translated[field]);
    });

    if (!target.displayDate) {
      target.displayDate = formatDisplayDate(item.date, language);
    }

    nextValues[languageIndex] = target;
  });

  return nextValues;
}

function findMatchingArrayEnd(source, startIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const character = source[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }

      continue;
    }

    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }

    if (character === "[") {
      depth += 1;
    } else if (character === "]") {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  throw new Error("Could not find the end of the news translation array.");
}

export function replaceNewsEntry(source, itemId, entryValues) {
  const key = `news.items.${itemId}`;
  const keyToken = JSON.stringify(key);
  const keyIndex = source.indexOf(keyToken);

  if (keyIndex < 0) {
    throw new Error(`Could not find "${key}" in translations.js.`);
  }

  const colonIndex = source.indexOf(":", keyIndex + keyToken.length);
  const valueStart = source.indexOf("[", colonIndex + 1);

  if (colonIndex < 0 || valueStart < 0) {
    throw new Error(`Could not read the translation value for "${itemId}".`);
  }

  const valueEnd = findMatchingArrayEnd(source, valueStart);
  const serialized = JSON.stringify(entryValues, null, 2)
    .split("\n")
    .map((line, index) => index === 0 ? line : `    ${line}`)
    .join("\n");

  return (
    source.slice(0, valueStart) +
    serialized +
    source.slice(valueEnd + 1)
  );
}

export function assertUpdatedCatalog(source, expectedEntries) {
  const catalog = loadTranslationCatalog(source);

  Object.entries(expectedEntries).forEach(([itemId, values]) => {
    const actual = getEntryValues(catalog, itemId);

    if (JSON.stringify(actual) !== JSON.stringify(values)) {
      throw new Error(
        `Updated catalogue validation failed for "${itemId}".`
      );
    }
  });
}
