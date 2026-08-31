import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("Vercel routes every staff API path to the single Express function", async () => {
  const [packageJson, vercelConfig, handlerSource] = await Promise.all([
    readFile(resolve(repositoryRoot, "package.json"), "utf8").then(JSON.parse),
    readFile(resolve(repositoryRoot, "vercel.json"), "utf8").then(JSON.parse),
    readFile(resolve(repositoryRoot, "api/index.js"), "utf8")
  ]);

  assert.equal(packageJson.type, "module");
  assert.match(handlerSource, /staff-app\/src\/vercel\.js/);
  assert.deepEqual(vercelConfig.rewrites, [
    { source: "/api/staff", destination: "/api" },
    { source: "/api/staff/:path*", destination: "/api" }
  ]);
  assert.deepEqual(Object.keys(vercelConfig.functions), ["api/index.js"]);
  await access(resolve(repositoryRoot, "api/index.js"));
});
