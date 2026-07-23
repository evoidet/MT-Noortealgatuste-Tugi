import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const htmlFiles = fs
  .readdirSync(root)
  .filter((name) => name.endsWith(".html"))
  .sort();

const failures = [];
const senderFormId = "azpjE7";
const supportedLanguages = ["et", "en", "ru"];
const forbiddenEmail = ["info", "noortetugi.ee"].join("@");
const ignoredDirectories = new Set([".git", "node_modules"]);
const textFileExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".txt",
  ".xml",
]);

const translationContext = {
  window: {}
};

vm.runInNewContext(
  fs.readFileSync(path.join(root, "translations.js"), "utf8"),
  translationContext,
  {
    filename: "translations.js"
  }
);

const translations = translationContext.window.SITE_TRANSLATIONS || {};

function report(file, message) {
  failures.push(`${file}: ${message}`);
}

function collectTextFiles(directory, relativeDirectory = "") {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = path.join(relativeDirectory, entry.name);
      const absolutePath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return ignoredDirectories.has(entry.name)
          ? []
          : collectTextFiles(absolutePath, relativePath);
      }

      return textFileExtensions.has(path.extname(entry.name).toLowerCase())
        ? [relativePath]
        : [];
    });
}

for (const file of collectTextFiles(root)) {
  const source = fs.readFileSync(path.join(root, file), "utf8");

  if (source.toLowerCase().includes(forbiddenEmail)) {
    report(file, `forbidden email "${forbiddenEmail}" is still present`);
  }
}

const translationKeys = new Set(
  supportedLanguages.flatMap((language) =>
    Object.keys(translations[language] || {}),
  ),
);

for (const key of translationKeys) {
  for (const language of supportedLanguages) {
    const value = translations[language]?.[key];

    if (value === undefined || value === null || value === "") {
      report(
        "translations.js",
        `missing ${language} translation for "${key}"`,
      );
    }
  }
}

function localTarget(reference) {
  if (
    !reference ||
    /^(?:https?:|mailto:|tel:|javascript:|data:|#)/i.test(reference) ||
    reference.includes("${")
  ) {
    return null;
  }

  const clean = reference.split(/[?#]/, 1)[0];

  if (!clean) {
    return null;
  }

  return path.resolve(root, clean.replace(/^[/\\]+/, ""));
}

for (const file of htmlFiles) {
  const source = fs.readFileSync(path.join(root, file), "utf8");

  if (/sendsmaily|smaily/i.test(source)) {
    report(file, "legacy Smaily integration is still present");
  }

  if (!/<meta\s+name=["']description["']/i.test(source)) {
    report(file, "missing meta description");
  }

  if (!/<link\s+rel=["']canonical["']/i.test(source)) {
    report(file, "missing canonical link");
  }

  if (!/<meta\s+property=["']og:image["']/i.test(source)) {
    report(file, "missing Open Graph image");
  }

  const siteConfigIndex = source.search(
    /\/site-config\.js(?:\?[^"']*)?["']/i,
  );
  const sharedScriptIndex = source.search(
    /\/script\.js(?:\?[^"']*)?["']/i,
  );

  if (
    sharedScriptIndex !== -1 &&
    (
      siteConfigIndex === -1 ||
      siteConfigIndex > sharedScriptIndex
    )
  ) {
    report(file, "site-config.js must load before script.js");
  }

  const translationsIndex = source.search(
    /\/translations\.js(?:\?[^"']*)?["']/i,
  );
  const i18nIndex = source.search(
    /\/i18n\.js(?:\?[^"']*)?["']/i,
  );
  const headEndIndex = source.toLowerCase().indexOf("</head>");

  if (
    translationsIndex === -1 ||
    i18nIndex === -1 ||
    translationsIndex > i18nIndex ||
    i18nIndex > headEndIndex
  ) {
    report(
      file,
      "translations.js and i18n.js must load in that order inside <head>"
    );
  }

  for (const language of supportedLanguages) {
    const buttonPattern = new RegExp(
      `<button\\b[^>]*\\bdata-lang=["']${language}["']`,
      "i"
    );

    if (!buttonPattern.test(source)) {
      report(file, `missing language button "${language}"`);
    }
  }

  for (const match of source.matchAll(
    /\bdata-i18n(?:-[\w-]+)?=["']([^"']+)["']/gi,
  )) {
    const key = match[1];

    for (const language of supportedLanguages) {
      const value = translations[language]?.[key];

      if (value === undefined || value === null || value === "") {
        report(file, `missing ${language} translation for "${key}"`);
      }
    }
  }

  const senderForms = [
    ...source.matchAll(/\bdata-sender-form-id=["']([^"']+)["']/gi),
  ];

  if (senderForms.length) {
    const senderLoaderIndex = source.indexOf('/sender-init.js"');
    const headEndIndex = source.toLowerCase().indexOf("</head>");

    if (senderLoaderIndex === -1 || senderLoaderIndex > headEndIndex) {
      report(file, "sender-init.js must load inside <head>");
    }

    for (const match of senderForms) {
      if (match[1] !== senderFormId) {
        report(file, `unexpected Sender form id "${match[1]}"`);
      }
    }
  }

  for (const match of source.matchAll(
    /<form\b[^>]*class=["'][^"']*newsletter[^"']*["'][^>]*>[\s\S]*?<\/form>/gi,
  )) {
    const form = match[0];

    if (!/\baction=["'][^"']+["']/i.test(form)) {
      report(file, "newsletter form is missing an action");
    }

    if (
      !/<input\b[^>]*type=["']email["'][^>]*name=["']email["']/i.test(form) &&
      !/<input\b[^>]*name=["']email["'][^>]*type=["']email["']/i.test(form)
    ) {
      report(file, "newsletter email input is missing name=\"email\"");
    }
  }

  const ids = [
    ...source.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi),
  ].map((match) => match[1]);

  for (const id of new Set(ids)) {
    const count = ids.filter((candidate) => candidate === id).length;

    if (count > 1) {
      report(file, `duplicate id "${id}" (${count} occurrences)`);
    }
  }

  for (const match of source.matchAll(
    /(?:src|href)\s*=\s*["']([^"']+)["']/gi,
  )) {
    const target = localTarget(match[1]);

    if (target && !fs.existsSync(target)) {
      report(file, `missing local reference "${match[1]}"`);
    }
  }

  if (/href\s*=\s*["']\.\.\.["']/i.test(source)) {
    report(file, 'placeholder href="..." is still present');
  }

  for (const match of source.matchAll(
    /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      new vm.Script(match[1], { filename: file });
    } catch (error) {
      report(file, `inline script syntax error: ${error.message}`);
    }
  }
}

const sourceFiles = fs
  .readdirSync(root)
  .filter((name) => /\.(?:css|js)$/i.test(name));

for (const file of sourceFiles) {
  const source = fs.readFileSync(path.join(root, file), "utf8");

  if (/sendsmaily|smaily/i.test(source)) {
    report(file, "legacy Smaily integration is still present");
  }

  for (const match of source.matchAll(
    /["'](\/?assets\/[^"'?#)\s]+)["']|url\(["']?(\/?assets\/[^)"'?#\s]+)/gi,
  )) {
    const reference = match[1] || match[2];
    const target = localTarget(reference);

    if (target && !fs.existsSync(target)) {
      report(file, `missing asset "${reference}"`);
    }
  }
}

if (failures.length) {
  console.error("Site checks failed:\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    `Site checks passed for ${htmlFiles.length} HTML pages and ${sourceFiles.length} CSS/JS files.`,
  );
}
