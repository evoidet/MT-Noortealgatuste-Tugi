import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolsDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(toolsDirectory, "..");
const outputDirectory = resolve(projectRoot, "dist");
const expectedOutputDirectory = resolve(projectRoot, "dist");
const publicExtensions = new Set([".css", ".html", ".ico", ".js", ".png", ".txt", ".xml"]);

if (outputDirectory !== expectedOutputDirectory || dirname(outputDirectory) !== projectRoot) {
  throw new Error("Refusing to clean an unexpected build output directory.");
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const entry of await readdir(projectRoot, { withFileTypes: true })) {
  if (!entry.isFile() || !publicExtensions.has(extname(entry.name).toLowerCase())) continue;
  await cp(resolve(projectRoot, entry.name), resolve(outputDirectory, entry.name));
}

await cp(resolve(projectRoot, "assets"), resolve(outputDirectory, "assets"), { recursive: true });
await cp(resolve(projectRoot, "staff-app/public"), resolve(outputDirectory, "admin"), { recursive: true });

console.log("Prepared the public site and staff admin assets in dist/.");
