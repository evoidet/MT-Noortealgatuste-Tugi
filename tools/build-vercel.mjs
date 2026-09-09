import { spawn } from "node:child_process";
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolsDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(toolsDirectory, "..");
const outputDirectory = resolve(projectRoot, "dist");
const expectedOutputDirectory = resolve(projectRoot, "dist");
// Publish only reviewed public entry points, never arbitrary root-level files.
const publicFiles = new Set([
  "index.html", "uudised.html", "vorgustik.html", "laager.html", "street.html",
  "tunnustusgala.html", "privaatsuspoliitika.html", "dokumendid.html",
  "style.css", "home.css", "news.css", "vorgustik.css", "camp.css", "street.css",
  "gala.css", "privacy.css", "documents.css", "translations.js", "i18n.js",
  "script.js", "site-config.js", "sender-init.js", "news-data.js", "news-home.js",
  "news.js", "news-photo-lightbox.js", "favicon.ico", "favicon.png",
  "apple-touch-icon.png", "robots.txt", "sitemap.xml"
]);

async function runNodeScript(relativePath) {
  const scriptPath = resolve(projectRoot, relativePath);
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit"
    });
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      rejectRun(new Error(
        `${relativePath} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}.`
      ));
    });
  });
}

if (process.env.VERCEL_ENV === "production") {
  await runNodeScript("staff-app/scripts/db-migrate.mjs");
  await runNodeScript("staff-app/scripts/db-check.mjs");
}

if (outputDirectory !== expectedOutputDirectory || dirname(outputDirectory) !== projectRoot) {
  throw new Error("Refusing to clean an unexpected build output directory.");
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const entry of await readdir(projectRoot, { withFileTypes: true })) {
  if (!entry.isFile() || !publicFiles.has(entry.name)) continue;
  await cp(resolve(projectRoot, entry.name), resolve(outputDirectory, entry.name));
}

await cp(resolve(projectRoot, "assets"), resolve(outputDirectory, "assets"), { recursive: true });
await cp(resolve(projectRoot, "staff-app/public"), resolve(outputDirectory, "admin"), { recursive: true });

console.log("Prepared the public site and staff admin assets in dist/.");
