const API_ROOT = "/api/staff";

let csrfToken = "";

export class ApiError extends Error {
  constructor(message, status, payload = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export function setCsrfToken(token) {
  csrfToken = typeof token === "string" ? token : "";
}

function isStateChanging(method) {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

async function parseResponse(response) {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text ? { message: text } : null;
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

  if (!response.ok) {
    const message = payload?.error || payload?.message || `http_${response.status}`;
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

  createSubmission(type, data) {
    return request("/submissions", {
      method: "POST",
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

  uploadAttachment(id, file) {
    const body = new FormData();
    body.append("file", file, file.name);

    return request(`/submissions/${encodeURIComponent(id)}/attachments`, {
      method: "POST",
      body
    });
  },

  improveText({ text, field, mode, language }) {
    return request("/ai/improve", {
      method: "POST",
      json: { text, field, mode, language }
    });
  },

  audit() {
    return request("/audit");
  }
};

