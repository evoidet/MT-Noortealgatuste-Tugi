import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  __driveArchiveTestUtils,
  createDriveArchiveService,
  DriveArchiveError
} from "../src/drive-archive.js";

const rootId = "root-folder-1234567890";

function config(folderMap, options = {}) {
  return {
    googleDriveArchiveEnabled: true,
    googleDriveRootFolderId: rootId,
    googleDriveServiceAccountEmail: "archive@example.iam.gserviceaccount.com",
    googleDriveServiceAccountPrivateKey: "unused by fake",
    googleDriveUserFolderMap: new Map(Object.entries(folderMap)),
    googleDriveInvoiceFolderId: options.invoiceFolderId || "invoice-folder-123456",
    reimbursementRecipients: options.reimbursementRecipients || new Map()
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

test("authenticated creator can route an approved recipient only to that recipient's mapped folder", async () => {
  const drive = fakeDrive();
  drive.addParent("egor-folder-123456");
  drive.addParent("sofia-folder-123456");
  const recipients = new Map([
    ["egor@noortetugi.ee", "Egor S"],
    ["sofia@noortetugi.ee", "Sofia Germ"]
  ]);
  const service = createDriveArchiveService(config({
    "egor@noortetugi.ee": "egor-folder-123456",
    "sofia@noortetugi.ee": "sofia-folder-123456"
  }, { reimbursementRecipients: recipients }), { driveClient: drive });

  const result = await service.archiveExpense({
    submission: submission("egor@noortetugi.ee"),
    submitterEmail: "egor@noortetugi.ee",
    recipientEmail: "sofia@noortetugi.ee",
    files: archiveFiles()
  });
  assert.equal(result.parentFolderId, "sofia-folder-123456");
  assert.equal(drive.folders[0].parentId, "sofia-folder-123456");

  await assert.rejects(service.archiveExpense({
    submission: submission("egor@noortetugi.ee", "70a25fad-becd-4942-b0f6-979f71bb9960"),
    submitterEmail: "egor@noortetugi.ee",
    recipientEmail: "outsider@noortetugi.ee",
    files: archiveFiles()
  }), { code: "DRIVE_RECIPIENT_NOT_ALLOWED" });
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

test("Google client uses files.create requestBody and a fresh binary media stream", async () => {
  const calls = [];
  const listCalls = [];
  const googleApi = {
    auth: { GoogleAuth: class {} },
    drive() {
      return {
        files: {
          async list(request) {
            listCalls.push(request);
            return { data: { files: [] } };
          },
          async create(request) {
            calls.push(request);
            const chunks = [];
            if (request.media?.body) {
              for await (const chunk of request.media.body) chunks.push(Buffer.from(chunk));
            }
            return { data: { id: "uploaded-file-12345", received: Buffer.concat(chunks) } };
          }
        }
      };
    }
  };
  const client = __driveArchiveTestUtils.createGoogleDriveClient(config({}), googleApi);
  const content = Buffer.from([0, 1, 2, 255]);
  const uploaded = await client.uploadFile({
    parentId: "submission-folder-12345",
    submissionId: "60a25fad-becd-4942-b0f6-979f71bb9960",
    itemKey: "generated-document",
    filename: "kuluaruanne.docx",
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    content
  });

  assert.deepEqual(uploaded.received, content);
  assert.deepEqual(calls[0].requestBody, {
    name: "kuluaruanne.docx",
    parents: ["submission-folder-12345"],
    appProperties: {
      noortetugiSubmissionId: "60a25fad-becd-4942-b0f6-979f71bb9960",
      noortetugiArchiveItemKey: "generated-document"
    }
  });
  assert.equal(calls[0].media.mimeType,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

  await client.uploadFile({
    parentId: "invoice-folder-123456",
    submissionId: "60a25fad-becd-4942-b0f6-979f71bb9960",
    itemKey: "issued-invoice",
    archiveKind: "invoice",
    filename: "Arve_TEST_Client.docx",
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    content
  });
  assert.deepEqual(calls[1].requestBody.appProperties, {
    noortetugiSubmissionId: "60a25fad-becd-4942-b0f6-979f71bb9960",
    noortetugiArchiveItemKey: "issued-invoice",
    noortetugiArchiveKind: "invoice"
  });

  await client.findFile({
    parentId: "submission-folder-12345",
    submissionId: "60a25fad-becd-4942-b0f6-979f71bb9960",
    itemKey: "attachment:abc"
  });
  assert.match(listCalls[0].q, /^'submission-folder-12345' in parents and trashed = false and /);
  assert.match(listCalls[0].q,
    /appProperties has \{ key='noortetugiArchiveItemKey' and value='attachment:abc' \}$/);
  assert.equal(listCalls[0].corpora, undefined);
  assert.equal(listCalls[0].driveId, undefined);
  assert.equal(listCalls[0].includeItemsFromAllDrives, true);
});

test("failed attachment upload keeps prior files and retry reuses the folder and uploaded files", async () => {
  const drive = fakeDrive();
  drive.addParent("egor-folder-123456", { shared: true });
  const originalUpload = drive.uploadFile;
  let failOnce = true;
  drive.uploadFile = async (input) => {
    if (input.itemKey === "attachment:first" && failOnce) {
      failOnce = false;
      throw Object.assign(new Error("private provider response"), { response: { status: 503 } });
    }
    return originalUpload(input);
  };
  const service = createDriveArchiveService(config({
    "egor@noortetugi.ee": "egor-folder-123456"
  }), { driveClient: drive });
  const input = {
    submission: submission("egor@noortetugi.ee"),
    submitterEmail: "egor@noortetugi.ee",
    files: archiveFiles()
  };

  await assert.rejects(service.archiveExpense(input), { code: "DRIVE_ATTACHMENT_UPLOAD_FAILED" });
  assert.equal(drive.folders.length, 1);
  assert.deepEqual(drive.files.map(({ itemKey }) => itemKey), ["generated-document"]);

  await service.archiveExpense(input);
  assert.equal(drive.folders.length, 1);
  assert.deepEqual(drive.files.map(({ itemKey }) => itemKey), [
    "generated-document", "attachment:first", "attachment:second"
  ]);
});

test("generated upload quota and remote lookup failures have safe stage codes", async () => {
  const quotaDrive = fakeDrive();
  quotaDrive.addParent("egor-folder-123456", { shared: true });
  quotaDrive.uploadFile = async () => {
    throw Object.assign(new Error("provider body must stay private"), {
      response: { status: 403, data: { error: { errors: [{ reason: "storageQuotaExceeded" }] } } }
    });
  };
  const quotaService = createDriveArchiveService(config({
    "egor@noortetugi.ee": "egor-folder-123456"
  }), { driveClient: quotaDrive });
  await assert.rejects(quotaService.archiveExpense({
    submission: submission("egor@noortetugi.ee"),
    submitterEmail: "egor@noortetugi.ee",
    files: archiveFiles()
  }), { code: "DRIVE_SERVICE_ACCOUNT_STORAGE_QUOTA" });

  const lookupDrive = fakeDrive();
  lookupDrive.addParent("egor-folder-123456", { shared: true });
  const originalFind = lookupDrive.findFile;
  lookupDrive.findFile = async (input) => {
    if (input.itemKey) throw Object.assign(new Error("private lookup response"), { response: { status: 500 } });
    return originalFind(input);
  };
  const lookupService = createDriveArchiveService(config({
    "egor@noortetugi.ee": "egor-folder-123456"
  }), { driveClient: lookupDrive });
  await assert.rejects(lookupService.archiveExpense({
    submission: submission("egor@noortetugi.ee"),
    submitterEmail: "egor@noortetugi.ee",
    files: archiveFiles()
  }), { code: "DRIVE_REMOTE_FILE_LOOKUP_FAILED" });
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
    files: archiveFiles().slice(0, 2)
  });

  assert.equal(result.parentFolderId, "egor-folder-123456");
  assert.equal(drive.folders.length, 1);
  assert.deepEqual(drive.files.map(({ itemKey }) => itemKey), [
    "generated-document", "attachment:first"
  ]);
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

test("issued invoice uploads once to the dedicated folder with deterministic metadata and filename", async () => {
  const drive = fakeDrive();
  drive.addParent("invoice-folder-123456", { shared: true, parents: [] });
  const service = createDriveArchiveService(config({}, {
    invoiceFolderId: "invoice-folder-123456"
  }), { driveClient: drive });
  const invoice = {
    ...submission("finance@noortetugi.ee"),
    type: "invoice",
    data: { invoiceNumber: "2026/01", client: "Client: OÜ?" }
  };
  const input = {
    submission: invoice,
    file: {
      filename: "ignored.docx",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      content: Buffer.from("docx")
    }
  };

  const first = await service.archiveInvoice(input);
  const retry = await service.archiveInvoice(input);
  assert.equal(first.fileId, retry.fileId);
  assert.equal(drive.files.length, 1);
  assert.deepEqual({
    parentId: drive.files[0].parentId,
    itemKey: drive.files[0].itemKey,
    archiveKind: drive.files[0].archiveKind,
    filename: drive.files[0].filename
  }, {
    parentId: "invoice-folder-123456",
    itemKey: "issued-invoice",
    archiveKind: "invoice",
    filename: "Arve_2026_01_Client_ OÜ_.docx"
  });
});

test("invoice archive missing-folder, disabled, and upload failure states are explicit", async () => {
  const invoice = { ...submission("finance@noortetugi.ee"), type: "invoice",
    data: { invoiceNumber: "1", client: "Client" } };
  const file = { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    content: Buffer.from("docx") };
  await assert.rejects(
    createDriveArchiveService({ googleDriveArchiveEnabled: false }).archiveInvoice({ submission: invoice, file }),
    { code: "DRIVE_ARCHIVE_NOT_CONFIGURED" }
  );
  const missingService = createDriveArchiveService({ ...config({}), googleDriveInvoiceFolderId: "" }, {
    driveClient: fakeDrive()
  });
  await assert.rejects(missingService.archiveInvoice({ submission: invoice, file }),
    { code: "DRIVE_INVOICE_FOLDER_NOT_CONFIGURED" });

  const drive = fakeDrive();
  drive.addParent("invoice-folder-123456");
  drive.uploadFile = async () => { throw new Error("private provider body"); };
  const failingService = createDriveArchiveService(config({}), { driveClient: drive });
  await assert.rejects(failingService.archiveInvoice({ submission: invoice, file }),
    { code: "DRIVE_INVOICE_UPLOAD_FAILED" });
});

test("Drive credential configuration is absent from every browser asset", async () => {
  const publicDirectory = resolve(fileURLToPath(new URL(".", import.meta.url)), "../public");
  const files = await readdir(publicDirectory);
  const contents = await Promise.all(files.map((name) => readFile(resolve(publicDirectory, name), "utf8")));
  for (const content of contents) {
    assert.doesNotMatch(content, /GOOGLE_DRIVE_SERVICE_ACCOUNT_(?:EMAIL|PRIVATE_KEY)/);
    assert.doesNotMatch(content, /googleDriveServiceAccount(?:Email|PrivateKey)/);
    assert.doesNotMatch(content, /GOOGLE_DRIVE_(?:USER_FOLDER_MAP|INVOICE_FOLDER_ID)/);
    assert.doesNotMatch(content, /googleDrive(?:UserFolderMap|InvoiceFolderId)/);
  }
});
