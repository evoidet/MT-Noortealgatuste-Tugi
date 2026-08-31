import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createClientUploadGrant,
  createPrivateDownloadUrl,
  deleteAttachmentPermanently,
  persistUploadedFile,
  persistUploadedFileWithRecord,
  validateClientUploadMetadata,
  verifyClientUploadedFile
} from "../src/storage.js";

const config = Object.freeze({
  blobReadWriteToken: "unit-test-token",
  maxUploadBytes: 5 * 1024 * 1024,
  production: true
});

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl+X58AAAAASUVORK5CYII=",
  "base64"
);

function privateUrl(pathname) {
  return `https://unit-test.private.blob.vercel-storage.com/${pathname}`;
}

function streamOf(buffer) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(buffer);
      controller.close();
    }
  });
}

test("client upload metadata requires an allowed extension, MIME type, and size", () => {
  const valid = validateClientUploadMetadata({
    config,
    submission: { type: "news" },
    originalName: "photo.jpeg",
    mimeType: "image/jpeg",
    size: 123
  });
  assert.deepEqual(valid, {
    extension: "jpg",
    originalName: "photo.jpeg",
    mimeType: "image/jpeg",
    size: 123
  });
  assert.throws(
    () => validateClientUploadMetadata({
      config,
      submission: { type: "news" },
      originalName: "receipt.pdf",
      mimeType: "application/pdf",
      size: 123
    }),
    { code: "FILE_TYPE_NOT_ALLOWED" }
  );
  assert.throws(
    () => validateClientUploadMetadata({
      config,
      submission: { type: "expense" },
      originalName: "receipt.pdf",
      mimeType: "image/png",
      size: 123
    }),
    { code: "FILE_TYPE_NOT_ALLOWED" }
  );
});

test("server uploads use a non-guessable pathname and private Blob options", async () => {
  let putCall;
  const blobClient = {
    async put(pathname, body, options) {
      putCall = { pathname, body, options };
      return { pathname, url: privateUrl(pathname) };
    }
  };
  const stored = await persistUploadedFile({
    config,
    submission: { type: "news" },
    file: { buffer: png, originalname: "pixel.png", mimetype: "image/png" },
    blobClient
  });
  assert.match(stored.blobPathname, /^staff-attachments\/[a-f0-9]{64}\.png$/);
  assert.equal(stored.storageName, stored.blobPathname);
  assert.equal(stored.blobUrl, privateUrl(stored.blobPathname));
  assert.equal(stored.originalName, "pixel.png");
  assert.equal(stored.mimeType, "image/png");
  assert.equal(stored.size, png.length);
  assert.equal(stored.sha256, createHash("sha256").update(png).digest("hex"));
  assert.equal(putCall.body, png);
  assert.deepEqual(putCall.options, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: "image/png",
    token: "unit-test-token"
  });
});

test("client upload grant exposes only a scoped presigned PUT URL", async () => {
  let issueOptions;
  let presignOptions;
  const blobClient = {
    async issueSignedToken(options) {
      issueOptions = options;
      return { delegationToken: "delegation", clientSigningToken: "signing" };
    },
    async presignUrl(token, options) {
      assert.equal(token.delegationToken, "delegation");
      presignOptions = options;
      return { presignedUrl: "https://blob.vercel-storage.com/upload?signature=scoped" };
    }
  };
  const grant = await createClientUploadGrant({
    config,
    submission: { type: "expense" },
    originalName: "receipt.pdf",
    mimeType: "application/pdf",
    size: 2048,
    blobClient
  });
  assert.match(grant.pathname, /^staff-attachments\/[a-f0-9]{64}\.pdf$/);
  assert.equal(grant.method, "PUT");
  assert.deepEqual(grant.headers, { "Content-Type": "application/pdf" });
  assert.equal(grant.uploadUrl, "https://blob.vercel-storage.com/upload?signature=scoped");
  assert.equal("delegationToken" in grant, false);
  assert.equal("clientSigningToken" in grant, false);
  assert.equal(issueOptions.pathname, grant.pathname);
  assert.deepEqual(issueOptions.operations, ["put"]);
  assert.deepEqual(issueOptions.allowedContentTypes, ["application/pdf"]);
  assert.equal(issueOptions.maximumSizeInBytes, 2048);
  assert.equal(issueOptions.token, "unit-test-token");
  assert.equal(presignOptions.access, "private");
  assert.equal(presignOptions.operation, "put");
  assert.equal(presignOptions.allowOverwrite, false);
  assert.equal(presignOptions.addRandomSuffix, false);
});

test("database failure after a server upload compensates by deleting the Blob", async () => {
  let deleted;
  const blobClient = {
    async put(pathname) {
      return { pathname, url: privateUrl(pathname) };
    },
    async del(pathname, options) {
      deleted = { pathname, options };
    }
  };
  await assert.rejects(
    persistUploadedFileWithRecord({
      config,
      submission: { type: "news" },
      file: { buffer: png, originalname: "pixel.png", mimetype: "image/png" },
      blobClient,
      async createRecord() {
        throw new Error("database unavailable");
      }
    }),
    /database unavailable/
  );
  assert.match(deleted.pathname, /^staff-attachments\/[a-f0-9]{64}\.png$/);
  assert.deepEqual(deleted.options, { token: "unit-test-token" });
});

test("client completion re-verifies content and deletes a rejected Blob", async () => {
  const pathname = `staff-attachments/${"a".repeat(64)}.png`;
  const pdf = Buffer.from("%PDF-1.7\nnot really a png\n", "utf8");
  let deleted;
  const blobClient = {
    async get() {
      return {
        statusCode: 200,
        stream: streamOf(pdf),
        blob: { pathname, url: privateUrl(pathname), size: pdf.length }
      };
    },
    async del(value, options) {
      deleted = { value, options };
    }
  };
  await assert.rejects(
    verifyClientUploadedFile({
      config,
      submission: { type: "expense" },
      attachment: {
        blobPathname: pathname,
        originalName: "receipt.png",
        mimeType: "image/png",
        size: pdf.length
      },
      blobClient
    }),
    { code: "FILE_EXTENSION_MISMATCH" }
  );
  assert.deepEqual(deleted, {
    value: pathname,
    options: { token: "unit-test-token" }
  });
});

test("download grants are private, short-lived, and pathname-scoped", async () => {
  const pathname = `staff-attachments/${"b".repeat(64)}.pdf`;
  let issueOptions;
  const blobClient = {
    async issueSignedToken(options) {
      issueOptions = options;
      return { delegationToken: "delegation", clientSigningToken: "signing" };
    },
    async presignUrl(_token, options) {
      assert.equal(options.access, "private");
      assert.equal(options.operation, "get");
      assert.equal(options.pathname, pathname);
      return { presignedUrl: `${privateUrl(pathname)}?signature=scoped` };
    }
  };
  const grant = await createPrivateDownloadUrl({
    config,
    attachment: { blobPathname: pathname },
    ttlMs: 30_000,
    blobClient
  });
  assert.match(grant.url, /\.private\.blob\.vercel-storage\.com\//);
  assert.deepEqual(issueOptions.operations, ["get"]);
  assert.equal(issueOptions.pathname, pathname);
  assert.equal(issueOptions.token, "unit-test-token");
});

test("permanent deletion marks the row before Blob deletion and removes the row last", async () => {
  const pathname = `staff-attachments/${"c".repeat(64)}.pdf`;
  const attachment = { id: "attachment-1", blobPathname: pathname };
  const calls = [];
  await deleteAttachmentPermanently({
    config,
    attachment,
    blobClient: {
      async del(value) {
        calls.push(["blob", value]);
      }
    },
    async markDeletePending(value) {
      calls.push(["pending", value.id]);
    },
    async deleteRecord(value) {
      calls.push(["row", value.id]);
    }
  });
  assert.deepEqual(calls, [
    ["pending", "attachment-1"],
    ["blob", pathname],
    ["row", "attachment-1"]
  ]);
});
