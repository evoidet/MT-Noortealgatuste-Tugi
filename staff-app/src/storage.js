import { createHash, randomBytes } from "node:crypto";
import { extname } from "node:path";
import {
  del as deleteBlob,
  get as getBlob,
  issueSignedToken,
  presignUrl,
  put as putBlob
} from "@vercel/blob";
import { fileTypeFromBuffer } from "file-type";
import multer from "multer";

// Vercel Functions reject request bodies around 4.5 MB. Keeping multipart
// uploads below 4 MiB leaves room for form boundaries and headers. Larger
// files use createClientUploadGrant() and upload directly to private Blob.
export const VERCEL_SAFE_SERVER_UPLOAD_BYTES = 4 * 1024 * 1024;
export const DEFAULT_CLIENT_UPLOAD_TTL_MS = 10 * 60_000;
export const DEFAULT_DOWNLOAD_URL_TTL_MS = 60_000;

const ATTACHMENT_PREFIX = "staff-attachments";
const attachmentPathPattern = new RegExp(
  `^${ATTACHMENT_PREFIX}/[a-f0-9]{64}\\.(jpg|png|webp|pdf|docx|xlsx)$`
);

const fileTypes = Object.freeze({
  jpg: Object.freeze({ mimeType: "image/jpeg" }),
  png: Object.freeze({ mimeType: "image/png" }),
  webp: Object.freeze({ mimeType: "image/webp" }),
  pdf: Object.freeze({ mimeType: "application/pdf" }),
  docx: Object.freeze({
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  }),
  xlsx: Object.freeze({
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  })
});

const allowedBySubmission = Object.freeze({
  news: new Set(["jpg", "png", "webp"]),
  expense: new Set(["jpg", "png", "webp", "pdf", "docx", "xlsx"]),
  invoice: new Set(["jpg", "png", "webp", "pdf", "docx", "xlsx"])
});

const extensionAliases = Object.freeze({ jpeg: "jpg" });
const verificationFailureCodes = new Set([
  "FILE_REQUIRED",
  "FILE_TOO_LARGE",
  "FILE_TYPE_NOT_ALLOWED",
  "FILE_EXTENSION_MISMATCH",
  "FILE_SIZE_MISMATCH",
  "BLOB_NOT_PRIVATE",
  "BLOB_PATH_MISMATCH"
]);

const defaultBlobClient = Object.freeze({
  del: deleteBlob,
  get: getBlob,
  issueSignedToken,
  presignUrl,
  put: putBlob
});

export class StorageError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {{cause?: unknown, status?: number, cleanupTarget?: unknown}} [options]
   */
  constructor(code, message, { cause, status = 400, cleanupTarget } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "StorageError";
    this.code = code;
    this.status = status;
    if (cleanupTarget) this.cleanupTarget = cleanupTarget;
  }
}

export class StorageConsistencyError extends StorageError {
  /**
   * @param {string} message
   * @param {{cause?: unknown, cleanupTarget?: unknown}} [options]
   */
  constructor(message, { cause, cleanupTarget } = {}) {
    super("BLOB_CLEANUP_REQUIRED", message, {
      cause,
      cleanupTarget,
      status: 503
    });
    this.name = "StorageConsistencyError";
  }
}

function normalizeExtension(extension) {
  const normalized = String(extension || "").replace(/^\./, "").toLowerCase();
  return extensionAliases[normalized] ?? normalized;
}

function normalizeMimeType(value) {
  return String(value || "").split(";", 1)[0].trim().toLowerCase();
}

function submissionType(submission) {
  return typeof submission === "string" ? submission : submission?.type;
}

function maxUploadBytes(config) {
  const value = Number(config?.maxUploadBytes);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new StorageError("BLOB_CONFIG_INVALID", "A positive maxUploadBytes value is required.", {
      status: 500
    });
  }
  return value;
}

function blobToken(config) {
  const value = config?.blobReadWriteToken;
  if (typeof value !== "string" || value.length === 0) {
    throw new StorageError("BLOB_NOT_CONFIGURED", "Private Blob storage is not configured.", {
      status: 503
    });
  }
  return value;
}

function safeOriginalName(value) {
  const segments = String(value || "file").replace(/\\/g, "/").split("/");
  return (segments.at(-1) || "file")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"/\\|?*]/g, "_")
    .trim()
    .slice(0, 180) || "file";
}

function originalExtension(filename) {
  return normalizeExtension(extname(String(filename || "").replace(/\\/g, "/")));
}

function assertSubmissionAllows(submission, extension) {
  const allowed = allowedBySubmission[submissionType(submission)];
  if (!allowed || !allowed.has(extension)) {
    throw new StorageError("FILE_TYPE_NOT_ALLOWED", "This file type is not allowed.");
  }
}

function assertFileSize(config, size) {
  if (!Number.isSafeInteger(size) || size < 1) {
    throw new StorageError("FILE_REQUIRED", "No file was uploaded.");
  }
  if (size > maxUploadBytes(config)) {
    throw new StorageError("FILE_TOO_LARGE", "The uploaded file is too large.", { status: 413 });
  }
}

function assertOriginalExtension(filename, detectedExtension) {
  const extension = originalExtension(filename);
  if (!extension || !fileTypes[extension]) {
    throw new StorageError("FILE_TYPE_NOT_ALLOWED", "The filename has an unsupported extension.");
  }
  if (extension !== detectedExtension) {
    throw new StorageError(
      "FILE_EXTENSION_MISMATCH",
      "The file extension does not match its contents."
    );
  }
}

function validateDeclaredMime(extension, mimeType) {
  const normalizedMimeType = normalizeMimeType(mimeType);
  const expectedMimeType = fileTypes[extension]?.mimeType;
  if (!expectedMimeType || normalizedMimeType !== expectedMimeType) {
    throw new StorageError("FILE_TYPE_NOT_ALLOWED", "The declared MIME type is not allowed.");
  }
  return expectedMimeType;
}

function validateTtl(value, { fallback, maximum }) {
  const ttlMs = value ?? fallback;
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 10_000 || ttlMs > maximum) {
    throw new StorageError("BLOB_GRANT_INVALID", "The Blob grant lifetime is invalid.");
  }
  return ttlMs;
}

function validateCallback(callback, config) {
  if (!callback) return undefined;
  let parsed;
  try {
    parsed = new URL(callback.url);
  } catch {
    throw new StorageError("BLOB_CALLBACK_INVALID", "The Blob callback URL is invalid.");
  }
  const localDevelopment = !config?.production && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(localDevelopment && parsed.protocol === "http:")) {
    throw new StorageError("BLOB_CALLBACK_INVALID", "The Blob callback URL must use HTTPS.");
  }
  const tokenPayload = callback.tokenPayload;
  if (tokenPayload !== undefined && (typeof tokenPayload !== "string" || tokenPayload.length > 1024)) {
    throw new StorageError("BLOB_CALLBACK_INVALID", "The Blob callback payload is invalid.");
  }
  return {
    callbackUrl: parsed.toString(),
    ...(tokenPayload === undefined ? {} : { tokenPayload })
  };
}

function assertBlobPathname(pathname) {
  if (typeof pathname !== "string" || !attachmentPathPattern.test(pathname)) {
    throw new StorageError("BLOB_PATH_INVALID", "The attachment Blob pathname is invalid.", {
      status: 500
    });
  }
  return pathname;
}

function pathnameFromAttachment(attachment) {
  return assertBlobPathname(attachment?.blobPathname ?? attachment?.storageName);
}

function assertPrivateBlobUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new StorageError("BLOB_NOT_PRIVATE", "Blob returned an invalid private URL.", {
      status: 503
    });
  }
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname.toLowerCase().endsWith(".private.blob.vercel-storage.com")
  ) {
    throw new StorageError("BLOB_NOT_PRIVATE", "The configured Blob store is not private.", {
      status: 503
    });
  }
  return parsed.toString();
}

function storageMetadata({ pathname, blobUrl, originalName, mimeType, size, sha256 }) {
  return {
    // storageName remains as a compatibility alias while the database migrates.
    storageName: pathname,
    blobPathname: pathname,
    blobUrl,
    url: blobUrl,
    originalName,
    mimeType,
    size,
    sha256
  };
}

function cleanupTarget(value) {
  return {
    blobPathname: value?.blobPathname ?? value?.storageName,
    blobUrl: value?.blobUrl ?? value?.url
  };
}

function toBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  return Buffer.from(value);
}

async function readWebStream(stream, limit) {
  const chunks = [];
  let size = 0;
  if (typeof stream?.getReader === "function") {
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = toBuffer(value);
        size += chunk.length;
        if (size > limit) {
          await reader.cancel().catch(() => {});
          throw new StorageError("FILE_TOO_LARGE", "The uploaded file is too large.", {
            status: 413
          });
        }
        chunks.push(chunk);
      }
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw new StorageError("BLOB_READ_FAILED", "The private Blob could not be read.", {
        cause: error,
        status: 503
      });
    } finally {
      reader.releaseLock();
    }
  } else if (stream?.[Symbol.asyncIterator]) {
    try {
      for await (const value of stream) {
        const chunk = toBuffer(value);
        size += chunk.length;
        if (size > limit) {
          throw new StorageError("FILE_TOO_LARGE", "The uploaded file is too large.", {
            status: 413
          });
        }
        chunks.push(chunk);
      }
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw new StorageError("BLOB_READ_FAILED", "The private Blob could not be read.", {
        cause: error,
        status: 503
      });
    }
  } else {
    throw new StorageError("BLOB_READ_FAILED", "Blob returned an unreadable stream.", {
      status: 503
    });
  }
  return Buffer.concat(chunks, size);
}

async function validateFileBuffer({ config, submission, buffer, filename, declaredMimeType }) {
  assertFileSize(config, buffer.length);
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected) {
    throw new StorageError("FILE_TYPE_NOT_ALLOWED", "The file type could not be verified.");
  }
  const extension = normalizeExtension(detected.ext);
  const detectedMimeType = normalizeMimeType(detected.mime);
  const expectedMimeType = fileTypes[extension]?.mimeType;
  assertSubmissionAllows(submission, extension);
  if (!expectedMimeType || detectedMimeType !== expectedMimeType) {
    throw new StorageError("FILE_TYPE_NOT_ALLOWED", "This file type is not allowed.");
  }
  assertOriginalExtension(filename, extension);
  const normalizedDeclaredMimeType = normalizeMimeType(declaredMimeType);
  if (
    normalizedDeclaredMimeType &&
    normalizedDeclaredMimeType !== "application/octet-stream" &&
    normalizedDeclaredMimeType !== expectedMimeType
  ) {
    throw new StorageError("FILE_TYPE_NOT_ALLOWED", "The declared MIME type does not match the file.");
  }
  return { extension, mimeType: expectedMimeType };
}

export function createAttachmentBlobPathname(extension) {
  const normalizedExtension = normalizeExtension(extension);
  if (!fileTypes[normalizedExtension]) {
    throw new StorageError("FILE_TYPE_NOT_ALLOWED", "This file type is not allowed.");
  }
  return `${ATTACHMENT_PREFIX}/${randomBytes(32).toString("hex")}.${normalizedExtension}`;
}

export function validateClientUploadMetadata({ config, submission, originalName, mimeType, size }) {
  assertFileSize(config, size);
  const sanitizedOriginalName = safeOriginalName(originalName);
  const extension = originalExtension(sanitizedOriginalName);
  assertSubmissionAllows(submission, extension);
  if (!fileTypes[extension]) {
    throw new StorageError("FILE_TYPE_NOT_ALLOWED", "The filename has an unsupported extension.");
  }
  const expectedMimeType = validateDeclaredMime(extension, mimeType);
  return {
    extension,
    originalName: sanitizedOriginalName,
    mimeType: expectedMimeType,
    size
  };
}

export function createUploadMiddleware(config) {
  const configuredServerLimit = Number(config?.serverUploadMaxBytes);
  const serverLimit = Number.isSafeInteger(configuredServerLimit) && configuredServerLimit > 0
    ? configuredServerLimit
    : config?.production
      ? VERCEL_SAFE_SERVER_UPLOAD_BYTES
      : maxUploadBytes(config);
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: Math.min(maxUploadBytes(config), serverLimit),
      files: 1,
      fields: 4
    }
  }).single("file");
}

export async function validateUploadedFile({ config, submission, file }) {
  if (!file?.buffer?.length) {
    throw new StorageError("FILE_REQUIRED", "No file was uploaded.");
  }
  const buffer = toBuffer(file.buffer);
  const validated = await validateFileBuffer({
    config,
    submission,
    buffer,
    filename: file.originalname,
    declaredMimeType: file.mimetype
  });
  return {
    buffer,
    extension: validated.extension,
    originalName: safeOriginalName(file.originalname),
    mimeType: validated.mimeType,
    size: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex")
  };
}

export async function persistUploadedFile({
  config,
  submission,
  file,
  blobClient = defaultBlobClient
}) {
  const validated = await validateUploadedFile({ config, submission, file });
  const pathname = createAttachmentBlobPathname(validated.extension);
  const token = blobToken(config);
  let blob;
  try {
    blob = await blobClient.put(pathname, validated.buffer, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: validated.mimeType,
      token
    });
    if (blob?.pathname !== pathname) {
      throw new StorageError("BLOB_PATH_MISMATCH", "Blob returned an unexpected pathname.", {
        status: 503
      });
    }
    const blobUrl = assertPrivateBlobUrl(blob.url);
    return storageMetadata({
      pathname,
      blobUrl,
      originalName: validated.originalName,
      mimeType: validated.mimeType,
      size: validated.size,
      sha256: validated.sha256
    });
  } catch (error) {
    // If put() completed but validation of its response failed, remove the
    // object immediately. A cleanup failure is surfaced for durable retry.
    if (blob) {
      try {
        await blobClient.del(blob.pathname || pathname, { token });
      } catch (cleanupError) {
        throw new StorageConsistencyError(
          "The uploaded Blob needs cleanup after its metadata could not be accepted.",
          { cause: cleanupError, cleanupTarget: { blobPathname: blob.pathname || pathname } }
        );
      }
    }
    throw error;
  }
}

export async function createClientUploadGrant({
  config,
  submission,
  originalName,
  mimeType,
  size,
  ttlMs = undefined,
  callback = undefined,
  blobClient = defaultBlobClient
}) {
  const validated = validateClientUploadMetadata({
    config,
    submission,
    originalName,
    mimeType,
    size
  });
  const pathname = createAttachmentBlobPathname(validated.extension);
  const lifetime = validateTtl(ttlMs, {
    fallback: DEFAULT_CLIENT_UPLOAD_TTL_MS,
    maximum: 15 * 60_000
  });
  const validUntil = Date.now() + lifetime;
  const token = blobToken(config);
  const allowedContentTypes = [validated.mimeType];
  const onUploadCompleted = validateCallback(callback, config);
  const signedToken = await blobClient.issueSignedToken({
    pathname,
    operations: ["put"],
    validUntil,
    allowedContentTypes,
    maximumSizeInBytes: validated.size,
    token
  });
  const { presignedUrl: uploadUrl } = await blobClient.presignUrl(signedToken, {
    access: "private",
    operation: "put",
    pathname,
    validUntil,
    allowedContentTypes,
    maximumSizeInBytes: validated.size,
    allowOverwrite: false,
    addRandomSuffix: false,
    cacheControlMaxAge: 60,
    ...(onUploadCompleted ? { onUploadCompleted } : {})
  });
  return {
    pathname,
    originalName: validated.originalName,
    mimeType: validated.mimeType,
    size: validated.size,
    uploadUrl,
    method: "PUT",
    headers: { "Content-Type": validated.mimeType },
    expiresAt: new Date(validUntil).toISOString()
  };
}

export async function openPrivateAttachment({
  config,
  attachment,
  ifNoneMatch = undefined,
  blobClient = defaultBlobClient
}) {
  const pathname = pathnameFromAttachment(attachment);
  const result = await blobClient.get(pathname, {
    access: "private",
    token: blobToken(config),
    ...(ifNoneMatch ? { ifNoneMatch } : {})
  });
  if (!result) return null;
  if (result.statusCode === 304) {
    return { statusCode: 304, stream: null, blob: result.blob };
  }
  if (result.statusCode !== 200 || !result.stream) return null;
  if (result.blob?.pathname !== pathname) {
    throw new StorageError("BLOB_PATH_MISMATCH", "Blob returned an unexpected pathname.", {
      status: 503
    });
  }
  assertPrivateBlobUrl(result.blob.url);
  return { statusCode: 200, stream: result.stream, blob: result.blob };
}

export async function verifyClientUploadedFile({
  config,
  submission,
  attachment,
  deleteInvalid = true,
  blobClient = defaultBlobClient
}) {
  const pathname = pathnameFromAttachment(attachment);
  const opened = await openPrivateAttachment({ config, attachment, blobClient });
  if (!opened) {
    throw new StorageError("BLOB_NOT_FOUND", "The uploaded Blob was not found.", { status: 404 });
  }
  try {
    if (Number.isSafeInteger(opened.blob?.size) && opened.blob.size > maxUploadBytes(config)) {
      throw new StorageError("FILE_TOO_LARGE", "The uploaded file is too large.", { status: 413 });
    }
    const buffer = await readWebStream(opened.stream, maxUploadBytes(config));
    if (Number.isSafeInteger(attachment?.size) && attachment.size !== buffer.length) {
      throw new StorageError("FILE_SIZE_MISMATCH", "The uploaded file size does not match the grant.");
    }
    const validated = await validateFileBuffer({
      config,
      submission,
      buffer,
      filename: attachment?.originalName,
      declaredMimeType: attachment?.mimeType
    });
    return storageMetadata({
      pathname,
      blobUrl: assertPrivateBlobUrl(opened.blob.url),
      originalName: safeOriginalName(attachment?.originalName),
      mimeType: validated.mimeType,
      size: buffer.length,
      sha256: createHash("sha256").update(buffer).digest("hex")
    });
  } catch (error) {
    if (deleteInvalid && verificationFailureCodes.has(error?.code)) {
      try {
        await blobClient.del(pathname, { token: blobToken(config) });
      } catch (cleanupError) {
        throw new StorageConsistencyError(
          "A rejected client upload remains in Blob and needs cleanup.",
          { cause: cleanupError, cleanupTarget: { blobPathname: pathname } }
        );
      }
    }
    throw error;
  }
}

export async function createPrivateDownloadUrl({
  config,
  attachment,
  ttlMs,
  blobClient = defaultBlobClient
}) {
  const pathname = pathnameFromAttachment(attachment);
  const lifetime = validateTtl(ttlMs, {
    fallback: DEFAULT_DOWNLOAD_URL_TTL_MS,
    maximum: 5 * 60_000
  });
  const validUntil = Date.now() + lifetime;
  const signedToken = await blobClient.issueSignedToken({
    pathname,
    operations: ["get"],
    validUntil,
    token: blobToken(config)
  });
  const { presignedUrl: url } = await blobClient.presignUrl(signedToken, {
    access: "private",
    operation: "get",
    pathname,
    validUntil
  });
  assertPrivateBlobUrl(url);
  return { url, expiresAt: new Date(validUntil).toISOString() };
}

export async function deleteStoredFile({
  config,
  attachment,
  blobClient = defaultBlobClient
}) {
  const pathname = pathnameFromAttachment(attachment);
  await blobClient.del(pathname, { token: blobToken(config) });
}

/** @param {any} options */
export async function persistUploadedFileWithRecord(options) {
  const { createRecord, ...uploadOptions } = options;
  if (typeof createRecord !== "function") {
    throw new TypeError("createRecord must be a function.");
  }
  const stored = await persistUploadedFile(uploadOptions);
  try {
    return await createRecord(stored);
  } catch (error) {
    try {
      await deleteStoredFile({
        config: uploadOptions.config,
        attachment: stored,
        blobClient: uploadOptions.blobClient
      });
    } catch (cleanupError) {
      throw new StorageConsistencyError(
        "The database write failed and the uploaded Blob needs cleanup.",
        { cause: cleanupError, cleanupTarget: cleanupTarget(stored) }
      );
    }
    throw error;
  }
}

export async function deleteAttachmentPermanently({
  config,
  attachment,
  markDeletePending,
  deleteRecord,
  blobClient = defaultBlobClient
}) {
  if (typeof markDeletePending !== "function" || typeof deleteRecord !== "function") {
    throw new TypeError("markDeletePending and deleteRecord must be functions.");
  }
  // The database row becomes hidden but durable before touching Blob. If
  // either following operation fails, a retry can safely finish the deletion.
  await markDeletePending(attachment);
  try {
    await deleteStoredFile({ config, attachment, blobClient });
  } catch (error) {
    throw new StorageConsistencyError(
      "The attachment remains delete_pending because its Blob could not be deleted.",
      { cause: error, cleanupTarget: cleanupTarget(attachment) }
    );
  }
  try {
    await deleteRecord(attachment);
  } catch (error) {
    throw new StorageConsistencyError(
      "The Blob was deleted but its delete_pending database row needs cleanup.",
      { cause: error, cleanupTarget: cleanupTarget(attachment) }
    );
  }
}

// Kept as a compatibility export for callers migrating from local storage.
// It now returns a Blob pathname, never a filesystem path.
export function attachmentPath(_config, attachment) {
  return pathnameFromAttachment(attachment);
}

function encodeRfc5987(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

export function downloadFilenameHeader(filename) {
  const sanitized = safeOriginalName(filename);
  const safeAscii = sanitized.replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeRfc5987(sanitized)}`;
}
