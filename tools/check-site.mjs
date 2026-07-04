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

function report(file, message) {
  failures.push(`${file}: ${message}`);
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

  if (!/<meta\s+name=["']description["']/i.test(source)) {
    report(file, "missing meta description");
  }

  if (!/<link\s+rel=["']canonical["']/i.test(source)) {
    report(file, "missing canonical link");
  }

  if (!/<meta\s+property=["']og:image["']/i.test(source)) {
    report(file, "missing Open Graph image");
  }

  if (
    source.includes('/script.js"') &&
    (!source.includes('/site-config.js"') ||
      source.indexOf('/site-config.js"') > source.indexOf('/script.js"'))
  ) {
    report(file, "site-config.js must load before script.js");
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
