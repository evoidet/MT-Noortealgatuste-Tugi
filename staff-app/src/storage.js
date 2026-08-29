import { createHash, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { fileTypeFromBuffer } from "file-type";
import multer from "multer";

const allowedBySubmission = Object.freeze({
  news: new Set(["jpg", "png", "webp"]),
  expense: new Set(["jpg", "png", "webp", "pdf", "docx", "xlsx"]),
  invoice: new Set(["jpg", "png", "webp", "pdf", "docx", "xlsx"])
});

const extensionAliases = Object.freeze({ jpeg: "jpg" });

function normalizeExtension(extension) {
  const normalized = String(extension || "").replace(/^\./, "").toLowerCase();
  return extensionAliases[normalized] ?? normalized;
}

function safeOriginalName(value) {
  return basename(String(value || "file"))
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"/\\|?*]/g, "_")
    .slice(0, 180) || "file";
}

function storagePath(root, storageName) {
  const fullPath = resolve(join(root, storageName));
  const normalizedRoot = resolve(root);
  if (!fullPath.startsWith(`${normalizedRoot}\\`) && !fullPath.startsWith(`${normalizedRoot}/`)) {
    throw new Error("Unsafe storage path.");
  }
  return fullPath;
}

export function createUploadMiddleware(config) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadBytes, files: 1, fields: 4 }
  }).single("file");
}

export async function persistUploadedFile({ config, submission, file }) {
  if (!file?.buffer?.length) {
    const error = new Error("No file was uploaded.");
    error.code = "FILE_REQUIRED";
    throw error;
  }
  const detected = await fileTypeFromBuffer(file.buffer);
  if (!detected) {
    const error = new Error("The file type could not be verified.");
    error.code = "FILE_TYPE_NOT_ALLOWED";
    throw error;
  }
  const detectedExtension = normalizeExtension(detected.ext);
  const originalExtension = normalizeExtension(extname(file.originalname));
  const allowed = allowedBySubmission[submission.type] ?? new Set();
  if (!allowed.has(detectedExtension)) {
    const error = new Error("This file type is not allowed.");
    error.code = "FILE_TYPE_NOT_ALLOWED";
    throw error;
  }
  if (originalExtension && originalExtension !== detectedExtension) {
    const jpegPair = originalExtension === "jpg" && detectedExtension === "jpg";
    if (!jpegPair) {
      const error = new Error("The file extension does not match its contents.");
      error.code = "FILE_EXTENSION_MISMATCH";
      throw error;
    }
  }
  const storageName = `${randomBytes(24).toString("hex")}.${detectedExtension}`;
  const fullPath = storagePath(config.uploadsPath, storageName);
  await writeFile(fullPath, file.buffer, { flag: "wx", mode: 0o600 });
  return {
    storageName,
    originalName: safeOriginalName(file.originalname),
    mimeType: detected.mime,
    size: file.buffer.length,
    sha256: createHash("sha256").update(file.buffer).digest("hex"),
    fullPath
  };
}

export function attachmentPath(config, attachment) {
  return storagePath(config.uploadsPath, attachment.storageName);
}

export function downloadFilenameHeader(filename) {
  const safeAscii = safeOriginalName(filename).replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

