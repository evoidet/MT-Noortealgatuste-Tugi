#!/usr/bin/env node

import {
  copyFile,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  assertUpdatedCatalog,
  buildTranslationRequests,
  getEntryValues,
  loadNewsItems,
  loadTranslationCatalog,
  mergeTranslationPayload,
  replaceNewsEntry,
  validateTranslationPayload
} from "./lib/news-catalog.mjs";
import {
  createMockTranslationProvider,
  createOpenAITranslationProvider
} from "./providers/openai-translation-provider.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const translationsPath = path.join(projectRoot, "translations.js");
const newsDataPath = path.join(projectRoot, "news-data.js");
const backupDirectory = path.join(
  projectRoot,
  "admin-local",
  "backups"
);

function parseArguments(argv) {
  const options = {
    allMissing: false,
    dryRun: false,
    force: false,
    id: "",
    mock: false
  };

  argv.forEach((argument) => {
    if (argument.startsWith("--id=")) {
      options.id = argument.slice("--id=".length).trim();
    } else if (argument === "--all-missing") {
      options.allMissing = true;
    } else if (argument === "--force") {
      options.force = true;
    } else if (argument === "--dry-run") {
      options.dryRun = true;
    } else if (argument === "--mock") {
      options.mock = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  });

  if (Boolean(options.id) === options.allMissing) {
    throw new Error(
      "Use exactly one of --id=ARTICLE_ID or --all-missing."
    );
  }

  if (options.force && options.allMissing) {
    throw new Error(
      "--force is only supported together with --id=ARTICLE_ID."
    );
  }

  return options;
}

function parseEnvFile(source) {
  const values = {};

  source.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separator = trimmed.indexOf("=");

    if (separator < 1) {
      return;
    }

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  });

  return values;
}

async function loadLocalEnvironment() {
  for (const filename of [".env.local", ".env"]) {
    try {
      const source = await readFile(
        path.join(projectRoot, filename),
        "utf8"
      );
      const values = parseEnvFile(source);

      Object.entries(values).forEach(([key, value]) => {
        if (!process.env[key]) {
          process.env[key] = value;
        }
      });
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw new Error(`Could not read ${filename}: ${error.message}`);
      }
    }
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function writeAtomically(destination, source) {
  const temporaryPath = `${destination}.tmp-${process.pid}`;

  try {
    await writeFile(temporaryPath, source, "utf8");
    await rename(temporaryPath, destination);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw new Error(
      `Could not write ${path.basename(destination)}: ${error.message}`
    );
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  await loadLocalEnvironment();

  const [translationSource, newsDataSource] = await Promise.all([
    readFile(translationsPath, "utf8"),
    readFile(newsDataPath, "utf8")
  ]);

  const catalog = loadTranslationCatalog(translationSource);
  const allItems = loadNewsItems(newsDataSource);

  if (options.id && !allItems.some((item) => item.id === options.id)) {
    throw new Error(`News ID "${options.id}" does not exist.`);
  }

  const candidates = options.id
    ? allItems.filter((item) => item.id === options.id)
    : allItems;

  const jobs = candidates
    .map((item) => {
      const entryValues = getEntryValues(catalog, item.id);
      const requests = buildTranslationRequests(
        entryValues,
        options.force
      );

      return { entryValues, item, requests };
    })
    .filter((job) => Object.keys(job.requests).length > 0);

  if (!jobs.length) {
    console.log(
      options.force
        ? "No translatable articles were found."
        : "All requested news translations already exist; nothing changed."
    );
    return;
  }

  const translate = options.mock
    ? createMockTranslationProvider()
    : await createOpenAITranslationProvider({
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.TRANSLATION_MODEL
      });

  const completed = [];

  for (const job of jobs) {
    const languageSummary = Object.entries(job.requests)
      .map(([language, fields]) => `${language}: ${fields.join(", ")}`)
      .join("; ");

    console.log(`Translating ${job.item.id} (${languageSummary})...`);

    const payload = await translate({
      itemId: job.item.id,
      requests: job.requests,
      source: job.entryValues[0]
    });

    validateTranslationPayload(
      payload,
      job.requests,
      job.entryValues[0]
    );

    completed.push({
      itemId: job.item.id,
      values: mergeTranslationPayload(
        job.entryValues,
        job.item,
        payload,
        job.requests
      )
    });
  }

  let nextSource = translationSource;

  completed.forEach(({ itemId, values }) => {
    nextSource = replaceNewsEntry(nextSource, itemId, values);
  });

  assertUpdatedCatalog(
    nextSource,
    Object.fromEntries(
      completed.map(({ itemId, values }) => [itemId, values])
    )
  );

  if (options.dryRun) {
    console.log(
      `Dry run passed for ${completed.length} article(s); no files changed.`
    );
    return;
  }

  await mkdir(backupDirectory, { recursive: true });
  const backupPath = path.join(
    backupDirectory,
    `translations-${timestamp()}.js`
  );

  await copyFile(translationsPath, backupPath);
  await writeAtomically(translationsPath, nextSource);

  console.log(`Backup created: ${path.relative(projectRoot, backupPath)}`);
  console.log(
    `Saved translations for ${completed.length} article(s) to translations.js.`
  );
}

main().catch((error) => {
  console.error(`Translation failed: ${error.message}`);
  process.exitCode = 1;
});
