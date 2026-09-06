import { extname } from "node:path";
import { Readable } from "node:stream";
import { google } from "googleapis";

// The service must discover a pre-existing configured root/personal folder and
// recover tagged objects it created there. Explicit folder grants or Shared
// Drive membership remain the effective access boundary.
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const DRIVE_REQUEST_TIMEOUT_MS = 20_000;

export class DriveArchiveError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "DriveArchiveError";
    this.code = code;
  }
}

function safeDriveName(value, fallback = "file") {
  const cleaned = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return cleaned || fallback;
}

function uniqueFilenames(files) {
  const counts = new Map();
  return files.map((file) => {
    const filename = safeDriveName(file.filename);
    const key = filename.toLocaleLowerCase("en-US");
    const count = (counts.get(key) || 0) + 1;
    counts.set(key, count);
    if (count === 1) return { ...file, filename };
    const extension = extname(filename);
    const stem = filename.slice(0, filename.length - extension.length);
    return { ...file, filename: `${stem} (${count})${extension}` };
  });
}

function archiveFolderName(submission) {
  const dataDate = String(submission?.data?.date || "");
  const timestampDate = String(submission?.createdAt || submission?.updatedAt || "").slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dataDate)
    ? dataDate
    : /^\d{4}-\d{2}-\d{2}$/.test(timestampDate) ? timestampDate : "undated";
  const name = safeDriveName(submission?.creatorName || submission?.creatorEmail, "Staff");
  const shortId = String(submission?.id || "submission").slice(0, 8);
  return safeDriveName(`${date} — Kuulaaruanne — ${name} — ${shortId}`, `Kuulaaruanne — ${shortId}`);
}

function invoiceFilename(submission) {
  const number = safeDriveName(submission?.data?.invoiceNumber, "invoice")
    .replace(/[<>:"|?*]/g, "_");
  const customer = safeDriveName(
    submission?.data?.client || submission?.data?.clientName,
    "customer"
  ).replace(/[<>:"|?*]/g, "_");
  return `${safeDriveName(`Arve_${number}_${customer}`, "Arve_invoice_customer").slice(0, 175)}.docx`;
}

function escapeDriveQuery(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function fileId(value) {
  const normalized = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(normalized)) {
    throw new DriveArchiveError("DRIVE_RESPONSE_INVALID", "Google Drive returned an invalid file identifier.");
  }
  return normalized;
}

function driveResponseStatus(error) {
  const status = Number(error?.response?.status ?? error?.status);
  return Number.isInteger(status) ? status : null;
}

function driveProviderReason(error) {
  const errors = error?.response?.data?.error?.errors;
  const reason = Array.isArray(errors) ? errors.find((entry) => typeof entry?.reason === "string")?.reason : null;
  return typeof reason === "string" && /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(reason) ? reason : null;
}

function driveOperationError(error, fallbackCode, message) {
  if (error instanceof DriveArchiveError) return error;
  const reason = driveProviderReason(error);
  const code = reason === "storageQuotaExceeded"
    ? "DRIVE_SERVICE_ACCOUNT_STORAGE_QUOTA"
    : fallbackCode;
  return new DriveArchiveError(code, message, error);
}

async function getFolderMetadata(drive, id, { root = false } = {}) {
  try {
    return await drive.getFile(id);
  } catch (error) {
    const status = driveResponseStatus(error);
    const code = root
      ? "DRIVE_ROOT_NOT_ACCESSIBLE"
      : status === 404
        ? "DRIVE_FOLDER_NOT_FOUND"
        : "DRIVE_FOLDER_NOT_ACCESSIBLE";
    throw new DriveArchiveError(code, "Google Drive folder metadata is not accessible.", error);
  }
}

function validateArchiveRoot(root, expectedId) {
  if (!root || root.id !== expectedId) {
    throw new DriveArchiveError("DRIVE_ROOT_NOT_ACCESSIBLE", "The configured archive root is not accessible.");
  }
  if (root.trashed) {
    throw new DriveArchiveError("DRIVE_ROOT_TRASHED", "The configured archive root is trashed.");
  }
  if (root.mimeType !== FOLDER_MIME_TYPE) {
    throw new DriveArchiveError("DRIVE_ROOT_NOT_A_FOLDER", "The configured archive root is not a folder.");
  }
}

function validatePersonalFolder(folder, expectedId, rootId) {
  if (!folder || folder.id !== expectedId) {
    throw new DriveArchiveError("DRIVE_FOLDER_NOT_FOUND", "The configured staff folder was not found.");
  }
  if (folder.trashed) {
    throw new DriveArchiveError("DRIVE_FOLDER_TRASHED", "The configured staff folder is trashed.");
  }
  if (folder.mimeType !== FOLDER_MIME_TYPE) {
    throw new DriveArchiveError("DRIVE_NOT_A_FOLDER", "The configured staff item is not a folder.");
  }
  if (!Array.isArray(folder.parents) || !folder.parents.includes(rootId)) {
    throw new DriveArchiveError(
      "DRIVE_PARENT_MISMATCH",
      "The configured staff folder is not a direct child of the archive root."
    );
  }
  if (folder.capabilities?.canAddChildren === false) {
    throw new DriveArchiveError("DRIVE_FOLDER_NOT_WRITABLE", "The configured staff folder is not writable.");
  }
}

function validateWritableFolder(folder, expectedId, { prefix = "DRIVE_INVOICE_FOLDER" } = {}) {
  if (!folder || folder.id !== expectedId) {
    throw new DriveArchiveError(`${prefix}_NOT_FOUND`, "The configured Drive folder was not found.");
  }
  if (folder.trashed) {
    throw new DriveArchiveError(`${prefix}_TRASHED`, "The configured Drive folder is trashed.");
  }
  if (folder.mimeType !== FOLDER_MIME_TYPE) {
    throw new DriveArchiveError(`${prefix}_NOT_A_FOLDER`, "The configured Drive item is not a folder.");
  }
  if (folder.capabilities?.canAddChildren === false) {
    throw new DriveArchiveError(`${prefix}_NOT_WRITABLE`, "The configured Drive folder is not writable.");
  }
}

function createGoogleDriveClient(config, googleApi = google) {
  const auth = new googleApi.auth.GoogleAuth({
    credentials: {
      client_email: config.googleDriveServiceAccountEmail,
      private_key: config.googleDriveServiceAccountPrivateKey
    },
    scopes: [DRIVE_SCOPE]
  });
  const api = googleApi.drive({ version: "v3", auth });

  return {
    async getFile(id) {
      const response = await api.files.get({
        fileId: id,
        fields: "id,parents,mimeType,trashed,driveId,shared,capabilities(canAddChildren)",
        supportsAllDrives: true
      }, { timeout: DRIVE_REQUEST_TIMEOUT_MS });
      return response.data;
    },

    async findFile({ parentId, submissionId, itemKey = null, archiveKind = null, folder = false }) {
      const clauses = [
        `'${escapeDriveQuery(parentId)}' in parents`,
        "trashed = false",
        `appProperties has { key='noortetugiSubmissionId' and value='${escapeDriveQuery(submissionId)}' }`
      ];
      if (folder) clauses.push(`mimeType = '${FOLDER_MIME_TYPE}'`);
      if (itemKey) {
        clauses.push(`appProperties has { key='noortetugiArchiveItemKey' and value='${escapeDriveQuery(itemKey)}' }`);
      }
      if (archiveKind) {
        clauses.push(`appProperties has { key='noortetugiArchiveKind' and value='${escapeDriveQuery(archiveKind)}' }`);
      }
      const response = await api.files.list({
        q: clauses.join(" and "),
        fields: "files(id,name,mimeType,createdTime)",
        orderBy: "createdTime,name",
        pageSize: 10,
        spaces: "drive",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      }, { timeout: DRIVE_REQUEST_TIMEOUT_MS });
      return response.data?.files?.[0] || null;
    },

    async createFolder({ parentId, submissionId, name }) {
      const response = await api.files.create({
        requestBody: {
          name,
          mimeType: FOLDER_MIME_TYPE,
          parents: [parentId],
          appProperties: {
            noortetugiSubmissionId: submissionId,
            noortetugiArchiveKind: "expense"
          }
        },
        fields: "id,name",
        supportsAllDrives: true
      }, { timeout: DRIVE_REQUEST_TIMEOUT_MS });
      return response.data;
    },

    async uploadFile({ parentId, submissionId, itemKey, archiveKind = null, filename, contentType, content }) {
      const response = await api.files.create({
        requestBody: {
          name: filename,
          parents: [parentId],
          appProperties: {
            noortetugiSubmissionId: submissionId,
            noortetugiArchiveItemKey: itemKey,
            ...(archiveKind ? { noortetugiArchiveKind: archiveKind } : {})
          }
        },
        media: {
          mimeType: contentType,
          // A fresh stream is created for each attempt. SMTP receives a separate
          // Buffer and cannot consume this upload body.
          body: Readable.from([Buffer.from(content)])
        },
        fields: "id,name,size",
        supportsAllDrives: true
      }, { timeout: DRIVE_REQUEST_TIMEOUT_MS });
      return response.data;
    }
  };
}

function safeArchiveFile(file) {
  const content = Buffer.isBuffer(file?.content)
    ? file.content
    : file?.content instanceof Uint8Array ? Buffer.from(file.content) : null;
  const itemKey = String(file?.itemKey || "");
  const contentType = String(file?.contentType || "application/octet-stream").trim();
  if (!content?.length || !/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/i.test(contentType) ||
      !/^[A-Za-z0-9:_-]{1,200}$/.test(itemKey)) {
    const code = itemKey === "generated-document" || itemKey === "issued-invoice"
      ? "DRIVE_GENERATED_DOCUMENT_INVALID"
      : "DRIVE_ATTACHMENT_BODY_INVALID";
    throw new DriveArchiveError(code, "An archive file is invalid.");
  }
  return { ...file, content, contentType, itemKey };
}

export function createDriveArchiveService(config, overrides = {}) {
  const enabled = config.googleDriveArchiveEnabled === true;
  const drive = overrides.driveClient ?? (enabled ? createGoogleDriveClient(config, overrides.googleApi) : null);

  return Object.freeze({
    enabled,

    async archiveExpense({ submission, submitterEmail, recipientEmail: requestedRecipientEmail, files }) {
      if (!enabled) return { status: "disabled" };
      const email = String(submitterEmail || "").trim().toLowerCase();
      if (!email || email !== String(submission?.creatorEmail || "").trim().toLowerCase()) {
        throw new DriveArchiveError(
          "DRIVE_SUBMITTER_MISMATCH",
          "The authenticated submitter does not match the submission owner."
        );
      }
      const recipientEmail = String(requestedRecipientEmail || email).trim().toLowerCase();
      if (config.reimbursementRecipients?.size > 0 &&
          !config.reimbursementRecipients.has(recipientEmail)) {
        throw new DriveArchiveError(
          "DRIVE_RECIPIENT_NOT_ALLOWED",
          "The reimbursement recipient is not approved."
        );
      }
      if (!config.reimbursementRecipients?.size && recipientEmail !== email) {
        throw new DriveArchiveError(
          "DRIVE_RECIPIENT_NOT_ALLOWED",
          "The reimbursement recipient is not approved."
        );
      }
      const parentFolderId = config.googleDriveUserFolderMap.get(recipientEmail);
      if (!parentFolderId) {
        throw new DriveArchiveError(
          "DRIVE_FOLDER_NOT_CONFIGURED",
          "No Google Drive archive folder is configured for this staff account."
        );
      }
      const normalizedFiles = uniqueFilenames((files || []).map(safeArchiveFile));
      if (normalizedFiles.length < 2) {
        throw new DriveArchiveError("DRIVE_ARCHIVE_FILE_INVALID", "The expense archive package is incomplete.");
      }

      try {
        const root = await getFolderMetadata(drive, config.googleDriveRootFolderId, { root: true });
        validateArchiveRoot(root, config.googleDriveRootFolderId);
        const parent = await getFolderMetadata(drive, parentFolderId);
        validatePersonalFolder(parent, parentFolderId, config.googleDriveRootFolderId);

        let folder;
        try {
          folder = await drive.findFile({
            parentId: parentFolderId,
            submissionId: submission.id,
            folder: true
          });
        } catch (error) {
          throw driveOperationError(
            error,
            "DRIVE_SUBMISSION_FOLDER_LOOKUP_FAILED",
            "The submission archive folder lookup failed."
          );
        }
        if (!folder) {
          try {
            folder = await drive.createFolder({
              parentId: parentFolderId,
              submissionId: submission.id,
              name: archiveFolderName(submission)
            });
          } catch (error) {
            throw driveOperationError(
              error,
              "DRIVE_SUBMISSION_FOLDER_CREATE_FAILED",
              "The submission archive folder could not be created."
            );
          }
        }
        const folderId = fileId(folder?.id);
        for (const archiveFile of normalizedFiles) {
          let existing;
          try {
            existing = await drive.findFile({
              parentId: folderId,
              submissionId: submission.id,
              itemKey: archiveFile.itemKey
            });
          } catch (error) {
            throw driveOperationError(
              error,
              "DRIVE_REMOTE_FILE_LOOKUP_FAILED",
              "The archived-file lookup failed."
            );
          }
          if (existing) {
            fileId(existing.id);
            continue;
          }
          try {
            const uploaded = await drive.uploadFile({
              parentId: folderId,
              submissionId: submission.id,
              ...archiveFile
            });
            fileId(uploaded?.id);
          } catch (error) {
            throw driveOperationError(
              error,
              archiveFile.itemKey === "generated-document"
                ? "DRIVE_GENERATED_DOCUMENT_UPLOAD_FAILED"
                : "DRIVE_ATTACHMENT_UPLOAD_FAILED",
              "A Drive archive file upload failed."
            );
          }
        }
        return {
          status: "complete",
          parentFolderId,
          folderId,
          folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
          archivedAt: new Date().toISOString(),
          fileCount: normalizedFiles.length
        };
      } catch (error) {
        if (error instanceof DriveArchiveError) throw error;
        throw new DriveArchiveError("DRIVE_ARCHIVE_FAILED", "Google Drive archival failed.", error);
      }
    },

    async archiveInvoice({ submission, file }) {
      if (!enabled) {
        throw new DriveArchiveError(
          "DRIVE_ARCHIVE_NOT_CONFIGURED",
          "Google Drive archival is not enabled."
        );
      }
      if (!config.googleDriveInvoiceFolderId) {
        throw new DriveArchiveError(
          "DRIVE_INVOICE_FOLDER_NOT_CONFIGURED",
          "No Google Drive invoice folder is configured."
        );
      }
      if (submission?.type !== "invoice") {
        throw new DriveArchiveError("DRIVE_INVOICE_INVALID", "The invoice archive request is invalid.");
      }
      const archiveFile = safeArchiveFile({
        ...file,
        itemKey: "issued-invoice",
        filename: invoiceFilename(submission)
      });
      try {
        const folder = await getFolderMetadata(drive, config.googleDriveInvoiceFolderId);
        validateWritableFolder(folder, config.googleDriveInvoiceFolderId);
        let existing;
        try {
          existing = await drive.findFile({
            parentId: config.googleDriveInvoiceFolderId,
            submissionId: submission.id,
            itemKey: archiveFile.itemKey,
            archiveKind: "invoice"
          });
        } catch (error) {
          throw driveOperationError(
            error,
            "DRIVE_INVOICE_FILE_LOOKUP_FAILED",
            "The archived invoice lookup failed."
          );
        }
        let archived = existing;
        if (!archived) {
          try {
            archived = await drive.uploadFile({
              parentId: config.googleDriveInvoiceFolderId,
              submissionId: submission.id,
              archiveKind: "invoice",
              ...archiveFile
            });
          } catch (error) {
            throw driveOperationError(
              error,
              "DRIVE_INVOICE_UPLOAD_FAILED",
              "The invoice Drive upload failed."
            );
          }
        }
        const archivedFileId = fileId(archived?.id);
        return {
          status: "complete",
          fileId: archivedFileId,
          fileUrl: `https://drive.google.com/file/d/${archivedFileId}/view`,
          filename: archiveFile.filename,
          archivedAt: new Date().toISOString()
        };
      } catch (error) {
        if (error instanceof DriveArchiveError) throw error;
        throw new DriveArchiveError("DRIVE_INVOICE_ARCHIVE_FAILED", "Invoice Drive archival failed.", error);
      }
    }
  });
}

export const __driveArchiveTestUtils = Object.freeze({
  archiveFolderName,
  invoiceFilename,
  createGoogleDriveClient,
  driveOperationError,
  driveProviderReason,
  driveResponseStatus,
  safeDriveName,
  uniqueFilenames,
  validateArchiveRoot,
  validatePersonalFolder,
  validateWritableFolder
});
