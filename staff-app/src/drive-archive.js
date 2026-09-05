import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { GoogleAuth } from "google-auth-library";

// The service must discover a pre-existing configured root/personal folder and
// recover tagged objects it created there. Explicit folder grants or Shared
// Drive membership remain the effective access boundary.
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";
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

function multipartBody(metadata, contentType, content, boundary) {
  return Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`),
    content,
    Buffer.from(`\r\n--${boundary}--`)
  ]);
}

function createGoogleDriveClient(config) {
  const auth = new GoogleAuth({
    credentials: {
      client_email: config.googleDriveServiceAccountEmail,
      private_key: config.googleDriveServiceAccountPrivateKey
    },
    scopes: [DRIVE_SCOPE]
  });
  let clientPromise;
  const client = () => clientPromise ||= auth.getClient();

  return {
    async getFile(id) {
      const response = await (await client()).request({
        url: `${DRIVE_API}/${encodeURIComponent(id)}`,
        params: {
          fields: "id,parents,mimeType,trashed,driveId,shared,capabilities(canAddChildren)",
          supportsAllDrives: true
        },
        timeout: DRIVE_REQUEST_TIMEOUT_MS
      });
      return response.data;
    },

    async findFile({ parentId, submissionId, itemKey = null, folder = false }) {
      const clauses = [
        `'${escapeDriveQuery(parentId)}' in parents`,
        "trashed = false",
        `appProperties has { key='noortetugiSubmissionId' and value='${escapeDriveQuery(submissionId)}' }`
      ];
      if (folder) clauses.push(`mimeType = '${FOLDER_MIME_TYPE}'`);
      if (itemKey) {
        clauses.push(`appProperties has { key='noortetugiArchiveItemKey' and value='${escapeDriveQuery(itemKey)}' }`);
      }
      const response = await (await client()).request({
        url: DRIVE_API,
        params: {
          q: clauses.join(" and "),
          fields: "files(id,name,mimeType,createdTime)",
          orderBy: "createdTime,name",
          pageSize: 10,
          spaces: "drive",
          supportsAllDrives: true,
          includeItemsFromAllDrives: true
        },
        timeout: DRIVE_REQUEST_TIMEOUT_MS
      });
      return response.data?.files?.[0] || null;
    },

    async createFolder({ parentId, submissionId, name }) {
      const response = await (await client()).request({
        url: DRIVE_API,
        method: "POST",
        params: { fields: "id,name", supportsAllDrives: true },
        timeout: DRIVE_REQUEST_TIMEOUT_MS,
        data: {
          name,
          mimeType: FOLDER_MIME_TYPE,
          parents: [parentId],
          appProperties: {
            noortetugiSubmissionId: submissionId,
            noortetugiArchiveKind: "expense"
          }
        }
      });
      return response.data;
    },

    async uploadFile({ parentId, submissionId, itemKey, filename, contentType, content }) {
      const boundary = `noortetugi-${randomUUID()}`;
      const metadata = {
        name: filename,
        parents: [parentId],
        appProperties: {
          noortetugiSubmissionId: submissionId,
          noortetugiArchiveItemKey: itemKey
        }
      };
      const response = await (await client()).request({
        url: DRIVE_UPLOAD_API,
        method: "POST",
        params: { uploadType: "multipart", fields: "id,name", supportsAllDrives: true },
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        timeout: DRIVE_REQUEST_TIMEOUT_MS,
        data: multipartBody(metadata, contentType, content, boundary)
      });
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
    throw new DriveArchiveError("DRIVE_ARCHIVE_FILE_INVALID", "An archive file is invalid.");
  }
  return { ...file, content, contentType, itemKey };
}

export function createDriveArchiveService(config, overrides = {}) {
  const enabled = config.googleDriveArchiveEnabled === true;
  const drive = overrides.driveClient ?? (enabled ? createGoogleDriveClient(config) : null);

  return Object.freeze({
    enabled,

    async archiveExpense({ submission, submitterEmail, files }) {
      if (!enabled) return { status: "disabled" };
      const email = String(submitterEmail || "").trim().toLowerCase();
      if (!email || email !== String(submission?.creatorEmail || "").trim().toLowerCase()) {
        throw new DriveArchiveError(
          "DRIVE_SUBMITTER_MISMATCH",
          "The authenticated submitter does not match the submission owner."
        );
      }
      const parentFolderId = config.googleDriveUserFolderMap.get(email);
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

        let folder = await drive.findFile({
          parentId: parentFolderId,
          submissionId: submission.id,
          folder: true
        });
        if (!folder) {
          folder = await drive.createFolder({
            parentId: parentFolderId,
            submissionId: submission.id,
            name: archiveFolderName(submission)
          });
        }
        const folderId = fileId(folder?.id);
        for (const archiveFile of normalizedFiles) {
          const existing = await drive.findFile({
            parentId: folderId,
            submissionId: submission.id,
            itemKey: archiveFile.itemKey
          });
          if (existing) continue;
          await drive.uploadFile({
            parentId: folderId,
            submissionId: submission.id,
            ...archiveFile
          });
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
    }
  });
}

export const __driveArchiveTestUtils = Object.freeze({
  archiveFolderName,
  driveResponseStatus,
  safeDriveName,
  uniqueFilenames,
  validateArchiveRoot,
  validatePersonalFolder
});
