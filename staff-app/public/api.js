const API_ROOT = "/api/staff";

let csrfToken = "";
// Retain an uploaded file's completion step across retries in the same editor.
// A transient completion error must not create a second primary attachment.
const pendingCompletions = new WeakMap();
const uploadRequestKeys = new WeakMap();

export class ApiError extends Error {
  constructor(message, status, payload = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
    this.code = typeof payload?.error === "string" ? payload.error
      : typeof payload?.error?.code === "string" ? payload.error.code : message;
    this.stage = payload?.error?.stage || payload?.stage;
  }
}

export function setCsrfToken(token) {
  csrfToken = typeof token === "string" ? token : "";
}

function isStateChanging(method) {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

function uploadMimeType(file) {
  const extension = String(file?.name || "").split(".").pop()?.toLowerCase();
  const known = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  };
  return known[extension] || file?.type || "application/octet-stream";
}

async function parseResponse(response) {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";

  // Proxy/login/error pages are not successful API responses. Never include
  // their bodies in errors: HTML can contain sensitive diagnostic details.
  if (!/^application\/(?:[\w.-]+\+)?json(?:\s*;|$)/i.test(contentType)) {
    throw new ApiError("invalid_api_response", response.status, { error: "INVALID_API_RESPONSE" });
  }
  try {
    const payload = await response.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid JSON payload");
    return payload;
  } catch {
    throw new ApiError("invalid_api_response", response.status, { error: "INVALID_API_RESPONSE" });
  }
}

async function completeAttachment(file, completion) {
  try {
    const completed = await request(completion.path, { method: "POST", json: {} });
    if (completed?.attachment?.id !== completion.attachmentId ||
        (completed.attachment.storageStatus && completed.attachment.storageStatus !== "ready")) {
      throw new ApiError("invalid_attachment_response", 502, { error: "INVALID_ATTACHMENT_RESPONSE" });
    }
    pendingCompletions.delete(file);
    uploadRequestKeys.delete(file);
    return completed;
  } catch (error) {
    // These failures mean the server rejected/deleted the pending attachment.
    // Keep ambiguous failures cached so retry completes the original upload.
    if (error.code === "BLOB_NOT_FOUND") {
      // The grant/row still exists, but no bytes arrived. Reuse that grant's
      // idempotency key on retry instead of creating another pending image.
      pendingCompletions.delete(file);
    } else if (error.status === 404 || ["FILE_REQUIRED", "FILE_TOO_LARGE", "FILE_TYPE_NOT_ALLOWED",
      "FILE_EXTENSION_MISMATCH", "FILE_SIZE_MISMATCH", "BLOB_NOT_PRIVATE", "BLOB_PATH_MISMATCH"]
      .includes(error.code)) {
      pendingCompletions.delete(file);
      uploadRequestKeys.delete(file);
    }
    throw error;
  }
}

async function request(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");

  if (isStateChanging(method) && csrfToken) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  let body = options.body;

  if (Object.prototype.hasOwnProperty.call(options, "json")) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.json);
  }

  let response;

  try {
    response = await fetch(`${API_ROOT}${path}`, {
      method,
      headers,
      body,
      credentials: "same-origin",
      redirect: "follow",
      signal: options.signal
    });
  } catch (error) {
    throw new ApiError("network_error", 0, { cause: error });
  }

  const payload = await parseResponse(response);

  if (!response.ok || payload?.ok === false || payload?.success === false) {
    const message = typeof payload?.error === "string" ? payload.error
      : typeof payload?.error?.code === "string" ? payload.error.code
      : typeof payload?.message === "string" ? payload.message : `http_${response.status}`;
    throw new ApiError(message, response.status, payload);
  }

  return payload;
}

export const api = {
  session(options = {}) {
    return request("/session", options);
  },

  logout() {
    return request("/logout", { method: "POST", json: {} });
  },

  listSubmissions({ scope = "mine", type = "" } = {}) {
    const params = new URLSearchParams({ scope });

    if (type) {
      params.set("type", type);
    }

    return request(`/submissions?${params.toString()}`);
  },

  createSubmission(type, data, idempotencyKey) {
    return request("/submissions", {
      method: "POST",
      ...(idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : {}),
      json: { type, data }
    });
  },

  getSubmission(id) {
    return request(`/submissions/${encodeURIComponent(id)}`);
  },

  updateSubmission(id, data) {
    return request(`/submissions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      json: { data }
    });
  },

  submitSubmission(id) {
    return request(`/submissions/${encodeURIComponent(id)}/submit`, {
      method: "POST",
      json: {}
    });
  },

  reviewSubmission(id, decision, comment) {
    return request(`/submissions/${encodeURIComponent(id)}/review`, {
      method: "POST",
      json: { decision, comment }
    });
  },

  async uploadAttachment(id, file, kind = "additional") {
    const submissionId = encodeURIComponent(id);
    const attachmentKind = kind === "primary" ? "primary" : "additional";
    const previous = pendingCompletions.get(file);
    if (previous?.submissionId === id && previous.kind === attachmentKind) {
      try {
        return await completeAttachment(file, previous);
      } catch (error) {
        if (error.code !== "BLOB_NOT_FOUND") throw error;
        // A prior PUT had an uncertain result and verification now confirms
        // no bytes exist. Continue with the original upload request key.
      }
    }
    let attempt = uploadRequestKeys.get(file);
    if (attempt?.submissionId !== id || attempt?.kind !== attachmentKind) {
      attempt = { submissionId: id, kind: attachmentKind, key: globalThis.crypto?.randomUUID?.() };
      uploadRequestKeys.set(file, attempt);
    }
    const intent = await request(`/submissions/${submissionId}/attachments/upload-intent`, {
      method: "POST",
      ...(attempt.key ? { headers: { "Idempotency-Key": attempt.key } } : {}),
      json: {
        originalName: file.name,
        mimeType: uploadMimeType(file),
        size: file.size,
        kind: attachmentKind
      }
    });
    const grant = intent?.upload;
    if (!grant?.attachmentId || (grant.status !== "ready" && (!grant.uploadUrl || grant.method !== "PUT"))) {
      throw new ApiError("invalid_upload_grant", 500, intent);
    }
    const path = `/submissions/${submissionId}/attachments/${encodeURIComponent(grant.attachmentId)}/complete`;
    const completion = { submissionId: id, kind: attachmentKind, attachmentId: grant.attachmentId, path };
    if (grant.status === "ready") {
      pendingCompletions.set(file, completion);
      return completeAttachment(file, completion);
    }

    let uploadError;
    try {
      const uploadResponse = await fetch(grant.uploadUrl, {
        method: "PUT",
        headers: grant.headers || {},
        body: file,
        credentials: "omit",
        redirect: "error"
      });
      if (!uploadResponse.ok) {
        const code = uploadResponse.status === 413 ? "FILE_TOO_LARGE"
          : uploadResponse.status === 415 ? "FILE_TYPE_NOT_ALLOWED" : "BLOB_UPLOAD_FAILED";
        throw new ApiError("blob_upload_failed", uploadResponse.status, { error: code, stage: "upload" });
      }
    } catch (error) {
      uploadError = error instanceof ApiError ? error
        : new ApiError("blob_upload_failed", 0, { error: "BLOB_UPLOAD_FAILED", stage: "upload" });
    }
    // A failed response does not prove the PUT failed: Blob may have stored
    // the image before the connection dropped, or a retry may return 409.
    // Verify the original path before uploading again or discarding anything.
    pendingCompletions.set(file, completion);
    try {
      return await completeAttachment(file, completion);
    } catch (error) {
      if (uploadError && error.code === "BLOB_NOT_FOUND") throw uploadError;
      throw error;
    }
  },

  improveText({ text, field, mode, language }) {
    return request("/ai/improve", {
      method: "POST",
      signal: AbortSignal.timeout(25_000),
      json: { text, field, mode, language }
    });
  },

  audit() {
    return request("/audit");
  }
};
