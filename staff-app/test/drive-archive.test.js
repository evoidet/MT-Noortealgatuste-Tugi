import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createDriveArchiveService, DriveArchiveError } from "../src/drive-archive.js";

const rootId = "root-folder-1234567890";

function config(folderMap) {
  return {
    googleDriveArchiveEnabled: true,
    googleDriveRootFolderId: rootId,
    googleDriveServiceAccountEmail: "archive@example.iam.gserviceaccount.com",
    googleDriveServiceAccountPrivateKey: "unused by fake",
    googleDriveUserFolderMap: new Map(Object.entries(folderMap))
  };
}

function fakeDrive() {
  const folders = [];
  const files = [];
  const parents = new Map([[rootId, {
    id: rootId,
    mimeType: "application/vnd.google-apps.folder",
    parents: [],
    trashed: false,
    capabilities: { canAddChildren: true }
  }]]);
  return {
    folders,
    files,
    addParent(id, metadata = {}) { parents.set(id, { id,
      mimeType: "application/vnd.google-apps.folder", parents: [rootId], trashed: false,
      capabilities: { canAddChildren: true }, ...metadata }); },
    async getFile(id) { return parents.get(id); },
    async findFile({ parentId, submissionId, itemKey, folder }) {
      const source = folder ? folders : files;
      return source.find((item) => item.parentId === parentId &&
        item.submissionId === submissionId && (!itemKey || item.itemKey === itemKey)) || null;
    },
    async createFolder(input) {
      const item = { id: `folder-${folders.length}-1234567890`, ...input };
      folders.push(item);
      return item;
    },
    async uploadFile(input) {
      const item = { id: `file-${files.length}-1234567890`, ...input };
      files.push(item);
      return item;
    }
  };
}

function submission(email, id = "60a25fad-becd-4942-b0f6-979f71bb9960") {
  return {
    id,
    type: "expense",
    creatorEmail: email,
    creatorName: email.startsWith("andrei") ? "Andrei" : "Mario",
    createdAt: "2026-09-05T10:00:00.000Z",
    data: { date: "2026-09-05" }
  };
}

function archiveFiles() {
  return [
    { itemKey: "generated-document", filename: "kuluaruanne.docx",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      content: Buffer.from("document") },
    { itemKey: "attachment:first", filename: "receipt.pdf", contentType: "application/pdf",
      content: Buffer.from("first") },
    { itemKey: "attachment:second", filename: "receipt.pdf", contentType: "application/pdf",
      content: Buffer.from("second") }
  ];
}

test("disabled Drive archival preserves the existing submission path without a Drive client", async () => {
  const service = createDriveArchiveService({ googleDriveArchiveEnabled: false });
  const result = await service.archiveExpense({
    submission: submission("andrei@noortetugi.ee"),
    submitterEmail: "andrei@noortetugi.ee",
    files: archiveFiles()
  });
  assert.deepEqual(result, { status: "disabled" });
});

test("all six configured staff archive only into their distinct personal folders", async () => {
  const drive = fakeDrive();
  const mapping = Object.fromEntries(Array.from({ length: 6 }, (_, index) => [
    `member${index + 1}@noortetugi.ee`, `member-folder-${index + 1}-12345`
  ]));
  for (const folderId of Object.values(mapping)) drive.addParent(folderId);
  const service = createDriveArchiveService(config(mapping), { driveClient: drive });

  const results = [];
  for (let index = 0; index < 6; index += 1) {
    const email = `member${index + 1}@noortetugi.ee`;
    results.push(await service.archiveExpense({
      submission: submission(email, `${index + 1}0a25fad-becd-4942-b0f6-979f71bb9960`),
      submitterEmail: email,
      files: archiveFiles()
    }));
  }
  assert.deepEqual(results.map(({ parentFolderId }) => parentFolderId), Object.values(mapping));
  assert.deepEqual(drive.folders.map(({ parentId }) => parentId), Object.values(mapping));
  assert.equal(new Set(drive.folders.map(({ parentId }) => parentId)).size, 6);
});

test("generated document and every original attachment are archived once with stable collision names", async () => {
  const drive = fakeDrive();
  drive.addParent("andrei-folder-12345");
  const service = createDriveArchiveService(config({
    "andrei@noortetugi.ee": "andrei-folder-12345"
  }), { driveClient: drive });
  const input = { submission: submission("andrei@noortetugi.ee"),
    submitterEmail: "andrei@noortetugi.ee", files: archiveFiles() };

  const first = await service.archiveExpense(input);
  const retry = await service.archiveExpense(input);

  assert.equal(first.folderId, retry.folderId);
  assert.equal(drive.folders.length, 1);
  assert.equal(drive.files.length, 3);
  assert.deepEqual(drive.files.map(({ itemKey, filename }) => ({ itemKey, filename })), [
    { itemKey: "generated-document", filename: "kuluaruanne.docx" },
    { itemKey: "attachment:first", filename: "receipt.pdf" },
    { itemKey: "attachment:second", filename: "receipt (2).pdf" }
  ]);
  assert.match(drive.folders[0].name, /^2026-09-05 — Kuulaaruanne — Andrei — 60a25fad$/);
});

test("a direct-child My Drive folder shared with the service account does not require driveId", async () => {
  const drive = fakeDrive();
  drive.addParent("egor-folder-123456", { shared: true });
  const service = createDriveArchiveService(config({
    "egor@noortetugi.ee": "egor-folder-123456"
  }), { driveClient: drive });

  const result = await service.archiveExpense({
    submission: submission("egor@noortetugi.ee"),
    submitterEmail: "egor@noortetugi.ee",
    files: archiveFiles()
  });

  assert.equal(result.parentFolderId, "egor-folder-123456");
  assert.equal(drive.folders.length, 1);
  assert.equal(drive.files.length, 3);
});

test("unmapped users cannot fall through into another staff folder", async () => {
  const drive = fakeDrive();
  drive.addParent("andrei-folder-12345");
  const service = createDriveArchiveService(config({
    "andrei@noortetugi.ee": "andrei-folder-12345"
  }), { driveClient: drive });

  await assert.rejects(
    service.archiveExpense({ submission: submission("unknown@noortetugi.ee"),
      submitterEmail: "unknown@noortetugi.ee", files: archiveFiles() }),
    (error) => error instanceof DriveArchiveError && error.code === "DRIVE_FOLDER_NOT_CONFIGURED"
  );
  assert.equal(drive.folders.length, 0);
  assert.equal(drive.files.length, 0);
});

test("a mapped folder outside the configured root reports a safe parent mismatch", async () => {
  const drive = fakeDrive();
  drive.addParent("andrei-folder-12345", { parents: ["other-root"] });
  const service = createDriveArchiveService(config({
    "andrei@noortetugi.ee": "andrei-folder-12345"
  }), { driveClient: drive });
  await assert.rejects(
    service.archiveExpense({ submission: submission("andrei@noortetugi.ee"),
      submitterEmail: "andrei@noortetugi.ee", files: archiveFiles() }),
    { code: "DRIVE_PARENT_MISMATCH" }
  );
  assert.equal(drive.folders.length, 0);
});

test("folder metadata failures produce specific safe reason codes", async () => {
  const scenarios = [
    ["DRIVE_FOLDER_NOT_FOUND", { id: "wrong-folder-12345" }],
    ["DRIVE_FOLDER_TRASHED", { trashed: true }],
    ["DRIVE_NOT_A_FOLDER", { mimeType: "application/pdf" }],
    ["DRIVE_FOLDER_NOT_WRITABLE", { capabilities: { canAddChildren: false } }]
  ];
  for (const [code, metadata] of scenarios) {
    const drive = fakeDrive();
    drive.addParent("andrei-folder-12345", metadata);
    const service = createDriveArchiveService(config({
      "andrei@noortetugi.ee": "andrei-folder-12345"
    }), { driveClient: drive });
    await assert.rejects(service.archiveExpense({
      submission: submission("andrei@noortetugi.ee"),
      submitterEmail: "andrei@noortetugi.ee",
      files: archiveFiles()
    }), { code });
    assert.equal(drive.folders.length, 0);
  }
});

test("an inaccessible configured root reports a safe root reason without trying the mapped folder", async () => {
  const drive = fakeDrive();
  drive.addParent("andrei-folder-12345");
  const originalGetFile = drive.getFile;
  drive.getFile = async (id) => {
    if (id === rootId) throw Object.assign(new Error("provider body must stay private"), {
      response: { status: 403, data: { private: true } }
    });
    return originalGetFile(id);
  };
  const service = createDriveArchiveService(config({
    "andrei@noortetugi.ee": "andrei-folder-12345"
  }), { driveClient: drive });
  await assert.rejects(service.archiveExpense({
    submission: submission("andrei@noortetugi.ee"),
    submitterEmail: "andrei@noortetugi.ee",
    files: archiveFiles()
  }), { code: "DRIVE_ROOT_NOT_ACCESSIBLE" });
  assert.equal(drive.folders.length, 0);
});

test("an authenticated user cannot archive another user's submission", async () => {
  const drive = fakeDrive();
  drive.addParent("andrei-folder-12345");
  drive.addParent("mario-folder-123456");
  const service = createDriveArchiveService(config({
    "andrei@noortetugi.ee": "andrei-folder-12345",
    "mario@noortetugi.ee": "mario-folder-123456"
  }), { driveClient: drive });
  await assert.rejects(service.archiveExpense({
    submission: submission("andrei@noortetugi.ee"),
    submitterEmail: "mario@noortetugi.ee",
    files: archiveFiles()
  }), { code: "DRIVE_SUBMITTER_MISMATCH" });
  assert.equal(drive.folders.length, 0);
  assert.equal(drive.files.length, 0);
});

test("Drive credential configuration is absent from every browser asset", async () => {
  const publicDirectory = resolve(fileURLToPath(new URL(".", import.meta.url)), "../public");
  const files = await readdir(publicDirectory);
  const contents = await Promise.all(files.map((name) => readFile(resolve(publicDirectory, name), "utf8")));
  for (const content of contents) {
    assert.doesNotMatch(content, /GOOGLE_DRIVE_SERVICE_ACCOUNT_(?:EMAIL|PRIVATE_KEY)/);
    assert.doesNotMatch(content, /googleDriveServiceAccount(?:Email|PrivateKey)/);
  }
});
