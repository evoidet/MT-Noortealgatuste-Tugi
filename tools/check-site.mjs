import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { loadNewsItems } from "../scripts/lib/news-catalog.mjs";

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

function readJpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  const startOfFrameMarkers = new Set([
    0xc0,
    0xc1,
    0xc2,
    0xc3,
    0xc5,
    0xc6,
    0xc7,
    0xc9,
    0xca,
    0xcb,
    0xcd,
    0xce,
    0xcf,
  ]);
  let offset = 2;

  while (offset + 3 < buffer.length) {
    while (offset < buffer.length && buffer[offset] === 0xff) {
      offset += 1;
    }

    const marker = buffer[offset];
    offset += 1;

    if (
      marker === 0xd8 ||
      marker === 0xd9 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      continue;
    }

    if (offset + 1 >= buffer.length) {
      break;
    }

    const segmentLength = buffer.readUInt16BE(offset);

    if (
      startOfFrameMarkers.has(marker) &&
      segmentLength >= 7 &&
      offset + 6 < buffer.length
    ) {
      return {
        width: buffer.readUInt16BE(offset + 5),
        height: buffer.readUInt16BE(offset + 3),
      };
    }

    if (segmentLength < 2) {
      break;
    }

    offset += segmentLength;
  }

  return null;
}

function readWebpDimensions(buffer) {
  if (
    buffer.length < 20 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return null;
  }

  let offset = 12;

  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    const dataEnd = Math.min(dataOffset + chunkSize, buffer.length);

    if (chunkType === "VP8X" && dataOffset + 10 <= dataEnd) {
      return {
        width: buffer.readUIntLE(dataOffset + 4, 3) + 1,
        height: buffer.readUIntLE(dataOffset + 7, 3) + 1,
      };
    }

    if (
      chunkType === "VP8L" &&
      dataOffset + 5 <= dataEnd &&
      buffer[dataOffset] === 0x2f
    ) {
      const dimensions = buffer.readUInt32LE(dataOffset + 1);

      return {
        width: (dimensions & 0x3fff) + 1,
        height: ((dimensions >>> 14) & 0x3fff) + 1,
      };
    }

    if (chunkType === "VP8 " && dataOffset + 10 <= dataEnd) {
      const searchEnd = Math.min(dataOffset + 16, dataEnd - 5);

      for (let index = dataOffset; index <= searchEnd; index += 1) {
        if (
          buffer[index] === 0x9d &&
          buffer[index + 1] === 0x01 &&
          buffer[index + 2] === 0x2a
        ) {
          return {
            width: buffer.readUInt16LE(index + 3) & 0x3fff,
            height: buffer.readUInt16LE(index + 5) & 0x3fff,
          };
        }
      }
    }

    offset = dataOffset + chunkSize + (chunkSize % 2);
  }

  return null;
}

function readImageDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);

  if (
    buffer.length >= 24 &&
    buffer.toString("hex", 0, 8) === "89504e470d0a1a0a"
  ) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  const dimensions =
    readJpegDimensions(buffer) ||
    readWebpDimensions(buffer);

  if (!dimensions?.width || !dimensions?.height) {
    throw new Error("unsupported or unreadable image format");
  }

  return dimensions;
}

function isInsideDirectory(filePath, directory) {
  const relativePath = path.relative(directory, filePath);

  return (
    relativePath !== "" &&
    !relativePath.startsWith(`..${path.sep}`) &&
    relativePath !== ".." &&
    !path.isAbsolute(relativePath)
  );
}

const newsDataFile = "news-data.js";
const newsAssetsDirectory = path.join(root, "assets", "news");

try {
  const newsItems = loadNewsItems(
    fs.readFileSync(path.join(root, newsDataFile), "utf8"),
  );

  for (const item of newsItems) {
    const itemLabel = `news item "${item.id}"`;
    const imageFit = item.imageFit || "cover";

    if (!["cover", "contain"].includes(imageFit)) {
      report(
        newsDataFile,
        `${itemLabel} has unsupported imageFit "${imageFit}"`,
      );
    }

    const imageTarget = localTarget(item.image);

    if (!imageTarget || !isInsideDirectory(imageTarget, newsAssetsDirectory)) {
      report(
        newsDataFile,
        `${itemLabel} cover must be a local file inside assets/news`,
      );
      continue;
    }

    if (!fs.existsSync(imageTarget)) {
      report(newsDataFile, `${itemLabel} cover "${item.image}" is missing`);
      continue;
    }

    try {
      const { width, height } = readImageDimensions(imageTarget);
      const ratio = width / height;

      if (imageFit === "contain") {
        if (ratio >= 1) {
          report(
            newsDataFile,
            `${itemLabel} uses imageFit "contain", which is reserved for intentional portrait posters`,
          );
        }
      } else {
        if (ratio < 1.49 || ratio > 1.61) {
          report(
            newsDataFile,
            `${itemLabel} cover is ${width}x${height}; standard covers must stay between 3:2 and 8:5`,
          );
        }

        if (width < 1200 || height < 750) {
          report(
            newsDataFile,
            `${itemLabel} cover is ${width}x${height}; use at least 1200x750`,
          );
        }
      }
    } catch (error) {
      report(
        newsDataFile,
        `${itemLabel} cover could not be checked: ${error.message}`,
      );
    }

    if (!item.originalImage) {
      continue;
    }

    const originalTarget = localTarget(item.originalImage);

    if (
      !originalTarget ||
      !isInsideDirectory(originalTarget, newsAssetsDirectory)
    ) {
      report(
        newsDataFile,
        `${itemLabel} originalImage must be a local file inside assets/news`,
      );
      continue;
    }

    if (!fs.existsSync(originalTarget)) {
      report(
        newsDataFile,
        `${itemLabel} originalImage "${item.originalImage}" is missing`,
      );
      continue;
    }

    try {
      const { width, height } = readImageDimensions(originalTarget);
      const declaredWidth = Number(item.originalImageWidth);
      const declaredHeight = Number(item.originalImageHeight);

      if (
        Number.isFinite(declaredWidth) &&
        Number.isFinite(declaredHeight) &&
        (declaredWidth !== width || declaredHeight !== height)
      ) {
        report(
          newsDataFile,
          `${itemLabel} originalImage is ${width}x${height}, but ${declaredWidth}x${declaredHeight} is declared`,
        );
      }
    } catch (error) {
      report(
        newsDataFile,
        `${itemLabel} originalImage could not be checked: ${error.message}`,
      );
    }
  }
} catch (error) {
  report(newsDataFile, `could not load news catalogue: ${error.message}`);
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
    /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi,
  )) {
    const attributes = match[1];
    const inlineSource = match[2];

    if (/\btype\s*=\s*["']application\/ld\+json["']/i.test(attributes)) {
      try {
        JSON.parse(inlineSource);
      } catch (error) {
        report(file, `JSON-LD syntax error: ${error.message}`);
      }

      continue;
    }

    try {
      new vm.Script(inlineSource, { filename: file });
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
