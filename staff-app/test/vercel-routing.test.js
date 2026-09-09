import assert from "node:assert/strict";
import { access, readFile, mkdtemp, mkdir, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("build includes reviewed public entries and excludes arbitrary root scripts and text", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "noortetugi-build-test-"));
  try {
    await mkdir(resolve(root, "tools"));
    await mkdir(resolve(root, "assets"));
    await mkdir(resolve(root, "staff-app/public"), { recursive: true });
    await writeFile(resolve(root, "tools/build-vercel.mjs"), await readFile(resolve(repositoryRoot, "tools/build-vercel.mjs")));
    await writeFile(resolve(root, "index.html"), "<h1>Public</h1>");
    await writeFile(resolve(root, "unpublished-notes.txt"), "Synthetic internal note");
    await writeFile(resolve(root, "internal-tool.js"), "// Synthetic internal script");
    await promisify(execFile)(process.execPath, [resolve(root, "tools/build-vercel.mjs")], {
      env: { ...process.env, VERCEL_ENV: "preview" }
    });
    assert.deepEqual((await readdir(resolve(root, "dist"))).sort(), ["admin", "assets", "index.html"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Vercel routes every staff API path to the single Express function", async () => {
  const [packageJson, vercelConfig, handlerSource, buildSource] = await Promise.all([
    readFile(resolve(repositoryRoot, "package.json"), "utf8").then(JSON.parse),
    readFile(resolve(repositoryRoot, "vercel.json"), "utf8").then(JSON.parse),
    readFile(resolve(repositoryRoot, "api/index.js"), "utf8"),
    readFile(resolve(repositoryRoot, "tools/build-vercel.mjs"), "utf8")
  ]);

  assert.equal(packageJson.type, "module");
  assert.equal(vercelConfig.buildCommand, "npm run build");
  assert.match(packageJson.scripts.build, /tools\/build-vercel\.mjs/);
  assert.match(handlerSource, /staff-app\/src\/vercel\.js/);
  assert.deepEqual(vercelConfig.rewrites, [
    { source: "/api/staff", destination: "/api" },
    { source: "/api/staff/:path*", destination: "/api" }
  ]);
  assert.deepEqual(Object.keys(vercelConfig.functions), ["api/index.js"]);
  for (const source of ["/admin", "/admin/(.*)"]) {
    const headers = Object.fromEntries(vercelConfig.headers.find((entry) => entry.source === source).headers.map(({ key, value }) => [key, value]));
    assert.equal(headers["X-Frame-Options"], "DENY");
    assert.match(headers["Content-Security-Policy"], /frame-ancestors 'none'/);
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
  }
  assert.match(buildSource, /process\.env\.VERCEL_ENV === "production"/);
  assert.match(buildSource, /staff-app\/scripts\/db-migrate\.mjs/);
  assert.match(buildSource, /staff-app\/scripts\/db-check\.mjs/);
  assert.ok(
    buildSource.indexOf("db-migrate.mjs") < buildSource.indexOf("db-check.mjs"),
    "production migration must run before schema verification"
  );
  await access(resolve(repositoryRoot, "api/index.js"));
});
