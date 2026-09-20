import assert from "node:assert/strict";
import test from "node:test";
import { createGitHubNewsPublisher, GitHubNewsError } from "../src/github-news.js";
import { legacyNewsSlugs, assertPublishedArticlesPreserved } from "../src/news-reconciliation.js";

const article = Object.freeze({
  submissionId: "11111111-1111-4111-8111-111111111111",
  id: "test-news",
  title: "Test news",
  date: "2026-09-20"
});

function response(status, body) {
  return { status, ok: status >= 200 && status < 300, async json() { return body; } };
}

function publisher(fetchImpl) {
  return createGitHubNewsPublisher({ githubRepository: "owner/repo", githubBranch: "main",
    githubToken: "test-token", githubApiUrl: "https://api.github.test" }, { fetchImpl });
}

test("direct publishing creates the repository catalogue on main without a branch or PR", async () => {
  const calls = [];
  const result = await publisher(async (url, options) => {
    calls.push({ url, options });
    if (options.method === "GET") return response(404, { message: "not found" });
    return response(201, { commit: { sha: "abc123" } });
  }).publish(article);
  assert.equal(result.commitSha, "abc123");
  assert.equal(calls.length, 2);
  const body = JSON.parse(calls[1].options.body);
  assert.equal(body.branch, "main");
  assert.equal(body.sha, undefined);
  assert.deepEqual(JSON.parse(Buffer.from(body.content, "base64").toString("utf8")), [article]);
  assert.doesNotMatch(JSON.stringify(calls), /pull|refs\/heads/);
});

test("publishing updates by submission id, preserves other articles and uses the current SHA", async () => {
  const current = [{ ...article, title: "Old title" }, { ...article,
    submissionId: "22222222-2222-4222-8222-222222222222", id: "another-news" }];
  let written;
  const result = await publisher(async (_url, options) => {
    if (options.method === "GET") return response(200, { sha: "file-sha",
      content: Buffer.from(JSON.stringify(current)).toString("base64") });
    written = JSON.parse(options.body);
    return response(200, { commit: { sha: "updated" } });
  }).publish(article);
  assert.equal(result.operation, "update");
  assert.equal(written.sha, "file-sha");
  const saved = JSON.parse(Buffer.from(written.content, "base64").toString("utf8"));
  assert.equal(saved.length, 2);
  assert.equal(saved.find((item) => item.id === article.id).title, article.title);
});

test("an identical retry performs no commit", async () => {
  let calls = 0;
  const result = await publisher(async () => {
    calls++;
    return response(200, { sha: "file-sha", content: Buffer.from(`${JSON.stringify([article], null, 2)}\n`).toString("base64") });
  }).publish(article);
  assert.equal(result.unchanged, true);
  assert.equal(calls, 1);
});

test("a concurrent file update is read and merged before retrying the direct commit", async () => {
  let getCount = 0;
  let putCount = 0;
  const result = await publisher(async (_url, options) => {
    if (options.method === "GET") {
      getCount++;
      const other = getCount === 1 ? [] : [{ ...article,
        submissionId: "33333333-3333-4333-8333-333333333333", id: "concurrent-news" }];
      return response(200, { sha: `sha-${getCount}`, content: Buffer.from(JSON.stringify(other)).toString("base64") });
    }
    putCount++;
    return putCount === 1 ? response(409, {}) : response(200, { commit: { sha: "merged" } });
  }).publish(article);
  assert.equal(result.commitSha, "merged");
  assert.equal(getCount, 2);
  assert.equal(putCount, 2);
});

test("GitHub failures are classified without returning provider bodies or credentials", async () => {
  await assert.rejects(() => publisher(async () => response(403, {
    message: "token test-token cannot write secret/repository"
  })).publish(article), (error) => {
    assert.ok(error instanceof GitHubNewsError);
    assert.equal(error.code, "GITHUB_AUTHENTICATION_FAILED");
    assert.doesNotMatch(error.message, /test-token|secret\/repository/);
    return true;
  });
});

test("malformed catalogue and slug collisions stop publishing before a write", async () => {
  for (const contents of ["not-json", JSON.stringify([{ ...article }, { ...article }]),
    JSON.stringify([{ ...article, submissionId: "44444444-4444-4444-8444-444444444444" }])]) {
    let writes = 0;
    await assert.rejects(() => publisher(async (_url, options) => {
      if (options.method === "PUT") writes++;
      return response(200, { sha: "sha", content: Buffer.from(contents).toString("base64") });
    }).publish(article), (error) => ["GITHUB_NEWS_FILE_INVALID", "NEWS_SLUG_CONFLICT"].includes(error.code));
    assert.equal(writes, 0);
  }
});

function memoryPublisher(seed = [], catalogue = null) {
  const state = { catalogue, commits: 0, conflict: null };
  const instance = createGitHubNewsPublisher({ githubRepository: "synthetic/repo", githubToken: "synthetic" }, {
    loadPublishedArticles: async () => seed,
    fetchImpl: async (_url, options) => {
      if (options.method === "GET") return state.catalogue === null ? response(404, {}) : response(200, {
        sha: `sha-${state.commits}`, content: Buffer.from(JSON.stringify(state.catalogue)).toString("base64")
      });
      if (state.conflict) {
        state.catalogue = state.conflict; state.conflict = null;
        return response(409, {});
      }
      state.catalogue = JSON.parse(Buffer.from(JSON.parse(options.body).content, "base64").toString("utf8"));
      state.commits++;
      return response(200, { commit: { sha: `commit-${state.commits}` } });
    }
  });
  return { instance, state };
}

test("first missing or empty catalogue imports all published UUIDs in the same commit", async () => {
  const previous = { ...article, submissionId: "22222222-2222-4222-8222-222222222222", id: "previous", title: "Õ Новость" };
  for (const initial of [null, []]) {
    const { instance, state } = memoryPublisher([previous], initial);
    await instance.publish(article);
    assert.equal(state.catalogue.length, 2);
    assert.deepEqual(state.catalogue.find((item) => item.id === previous.id), previous);
    assert.equal(state.commits, 1);
    await instance.publish(article);
    assert.equal(state.commits, 1);
  }
});

test("reconciliation restores a missing UUID but never replaces newer repository content", async () => {
  const { instance, state } = memoryPublisher([article], []);
  await instance.publish(article, { preserveExisting: true });
  assert.equal(state.commits, 1);
  state.catalogue[0] = { ...article, id: "intentional-new-slug", title: "Newer repository revision" };
  await instance.publish(article, { preserveExisting: true });
  assert.equal(state.commits, 1);
  assert.equal(state.catalogue[0].id, "intentional-new-slug");
  assert.equal(state.catalogue[0].title, "Newer repository revision");
});

test("every legacy slug is reserved and cannot be written by a new UUID", async () => {
  const { instance, state } = memoryPublisher();
  for (const id of legacyNewsSlugs) {
    await assert.rejects(instance.publish({ ...article, id }), { code: "NEWS_SLUG_CONFLICT" });
  }
  assert.equal(state.commits, 0);
  assert.equal(state.catalogue, null);
});

test("concurrent publisher claiming the same slug wins without being overwritten on retry", async () => {
  const other = { ...article, submissionId: "33333333-3333-4333-8333-333333333333", title: "Other article" };
  const { instance, state } = memoryPublisher();
  state.conflict = [other];
  await assert.rejects(instance.publish(article), { code: "NEWS_SLUG_CONFLICT" });
  assert.deepEqual(state.catalogue, [other]);
  assert.equal(state.commits, 0);
});

test("concurrent repository revisions are preserved during database import retry", async () => {
  const previous = { ...article, submissionId: "44444444-4444-4444-8444-444444444444", id: "previous" };
  const updated = { ...previous, title: "New repository title" };
  const { instance, state } = memoryPublisher([previous]);
  state.conflict = [updated];
  await instance.publish(article);
  assert.deepEqual(state.catalogue.find((item) => item.id === previous.id), updated);
  assert.equal(state.catalogue.length, 2);
});

test("updating the same UUID retains its slug and cannot take a different UUID's slug", async () => {
  const other = { ...article, submissionId: "55555555-5555-4555-8555-555555555555", id: "other" };
  const { instance, state } = memoryPublisher([], [article, other]);
  await instance.publish({ ...article, title: "Changed title" });
  assert.equal(state.catalogue.length, 2);
  assert.equal(state.catalogue.find((item) => item.submissionId === article.submissionId).id, article.id);
  await assert.rejects(instance.publish({ ...article, id: other.id }), { code: "NEWS_SLUG_CONFLICT" });
  assert.equal(state.commits, 1);
});

test("deployment preservation check refuses a catalogue omitting any published UUID", () => {
  assert.throws(() => assertPublishedArticlesPreserved([article], []), /missing/);
  assert.throws(() => assertPublishedArticlesPreserved([article], [{ ...article, submissionId: "other" }]), /missing/);
  assert.doesNotThrow(() => assertPublishedArticlesPreserved([article], [{ ...article, title: "New revision" }]));
});
