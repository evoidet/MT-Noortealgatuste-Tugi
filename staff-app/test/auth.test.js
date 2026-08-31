import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createAuth } from "../src/auth.js";

function sha256(value) {
  return createHash("sha256").update(value).digest("base64url");
}

function config(overrides = {}) {
  return {
    baseUrl: "https://www.noortetugi.ee",
    googleCallbackUrl: "https://www.noortetugi.ee/api/staff/auth/google/callback",
    googleClientId: "test-client-id",
    googleClientSecret: "test-client-secret",
    allowedGoogleDomain: "noortetugi.ee",
    allowedStaffEmails: new Set(),
    adminEmails: new Set(),
    cookieName: "__Host-noortetugi_staff",
    production: true,
    sessionTtlMs: 60 * 60 * 1_000,
    oauthAttemptTtlMs: 10 * 60 * 1_000,
    csrfSecret: "test-csrf-secret",
    logHashSecret: "test-log-hash-secret",
    ...overrides
  };
}

function request(query = {}) {
  return {
    query,
    headers: { "user-agent": "test-agent" },
    ip: "192.0.2.1",
    socket: {},
    get(name) {
      return this.headers[String(name).toLowerCase()] ?? "";
    }
  };
}

function response() {
  return {
    cookies: [],
    clearedCookies: [],
    redirectTarget: null,
    statusCode: 200,
    body: undefined,
    cookie(name, value, options) {
      this.cookies.push({ name, value, options });
      return this;
    },
    clearCookie(name, options) {
      this.clearedCookies.push({ name, options });
      return this;
    },
    redirect(target) {
      this.redirectTarget = target;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    }
  };
}

function database(overrides = {}) {
  const calls = {
    oauthAttempts: [],
    sessions: [],
    users: [],
    audits: []
  };
  return {
    calls,
    async pruneExpired() {},
    async createOauthAttempt(attempt) {
      calls.oauthAttempts.push(attempt);
    },
    async consumeOauthAttempt() {
      return {
        codeVerifier: "stored-code-verifier",
        nonce: "stored-nonce",
        redirectPath: "/admin"
      };
    },
    async upsertUser(user) {
      calls.users.push(user);
      return { id: "user-1", ...user };
    },
    async createSession(session) {
      calls.sessions.push(session);
    },
    async getSession() {
      return null;
    },
    async deleteSession() {},
    async audit(entry) {
      calls.audits.push(entry);
    },
    ...overrides
  };
}

function googleClient(payload) {
  const calls = { authOptions: null, tokenOptions: null };
  return {
    calls,
    generateAuthUrl(options) {
      calls.authOptions = options;
      return "https://accounts.google.com/o/oauth2/v2/auth";
    },
    async getToken(options) {
      calls.tokenOptions = options;
      return { tokens: { id_token: "test-id-token" } };
    },
    async verifyIdToken() {
      return { getPayload: () => payload };
    }
  };
}

function validPayload(overrides = {}) {
  return {
    iss: "https://accounts.google.com",
    aud: "test-client-id",
    sub: "google-subject-123",
    email: "member@noortetugi.ee",
    email_verified: true,
    nonce: "stored-nonce",
    exp: Math.floor(Date.now() / 1_000) + 300,
    name: "Member Name",
    picture: "https://lh3.googleusercontent.com/profile-picture",
    ...overrides
  };
}

test("Google login start persists state, nonce, and PKCE before redirecting", async () => {
  const db = database();
  const google = googleClient(validPayload());
  const auth = createAuth({ config: config(), database: db, googleClient: google });
  const res = response();

  await auth.beginGoogleLogin(request({ returnTo: "https://attacker.example/admin" }), res);

  assert.equal(res.redirectTarget, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(db.calls.oauthAttempts.length, 1);
  assert.equal(db.calls.oauthAttempts[0].redirectPath, "/admin");
  assert.equal(db.calls.oauthAttempts[0].stateHash, sha256(google.calls.authOptions.state));
  assert.equal(db.calls.oauthAttempts[0].nonce, google.calls.authOptions.nonce);
  assert.deepEqual(google.calls.authOptions.scope, ["openid", "email", "profile"]);
  assert.equal(google.calls.authOptions.code_challenge_method, "S256");
  assert.equal(google.calls.authOptions.hd, "noortetugi.ee");
});

test("verified domain identity is upserted with Google profile fields and a persistent session", async () => {
  const db = database();
  const google = googleClient(validPayload());
  const auth = createAuth({ config: config(), database: db, googleClient: google });
  const res = response();

  await auth.completeGoogleLogin(request({ state: "state", code: "authorization-code" }), res);

  assert.deepEqual(db.calls.users, [{
    googleSubjectId: "google-subject-123",
    email: "member@noortetugi.ee",
    name: "Member Name",
    profilePictureUrl: "https://lh3.googleusercontent.com/profile-picture",
    role: "member"
  }]);
  assert.equal(db.calls.sessions.length, 1);
  assert.equal(db.calls.sessions[0].userId, "user-1");
  assert.equal(res.cookies.length, 1);
  assert.deepEqual(res.cookies[0].options, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 1_000
  });
  assert.equal("domain" in res.cookies[0].options, false);
  assert.equal(res.redirectTarget, "/admin");
  assert.equal(google.calls.tokenOptions.code, "authorization-code");
  assert.equal(google.calls.tokenOptions.codeVerifier, "stored-code-verifier");
});

test("only exact ADMIN_EMAILS entries receive admin on first login", async () => {
  const db = database();
  const google = googleClient(validPayload({ email: "ADMIN@NOORTETUGI.EE" }));
  const auth = createAuth({
    config: config({ adminEmails: new Set(["admin@noortetugi.ee"]) }),
    database: db,
    googleClient: google
  });

  await auth.completeGoogleLogin(request({ state: "state", code: "code" }), response());

  assert.equal(db.calls.users[0].email, "admin@noortetugi.ee");
  assert.equal(db.calls.users[0].role, "admin");
});

test("unverified, near-match-domain, and non-allowlisted identities are denied", async (t) => {
  for (const [name, payload, allowedStaffEmails] of [
    ["unverified", validPayload({ email_verified: false }), new Set()],
    ["near-match domain", validPayload({ email: "member@evilnoortetugi.ee" }), new Set()],
    ["not on exact allowlist", validPayload(), new Set(["other@noortetugi.ee"])]
  ]) {
    await t.test(name, async () => {
      const db = database();
      const auth = createAuth({
        config: config({ allowedStaffEmails }),
        database: db,
        googleClient: googleClient(payload)
      });
      const res = response();

      await auth.completeGoogleLogin(request({ state: "state", code: "code" }), res);

      assert.equal(res.redirectTarget, "/admin?auth=denied");
      assert.equal(db.calls.users.length, 0);
      assert.equal(db.calls.sessions.length, 0);
    });
  }
});

test("OAuth provider failures do not log sensitive error details", async () => {
  const sensitiveMarker = "authorization-code-or-token";
  const db = database();
  const google = googleClient(validPayload());
  google.getToken = async () => {
    throw new Error(sensitiveMarker);
  };
  const auth = createAuth({ config: config(), database: db, googleClient: google });
  const res = response();
  const messages = [];
  const originalConsoleError = console.error;
  console.error = (...values) => messages.push(values.join(" "));
  try {
    await auth.completeGoogleLogin(request({ state: "state", code: sensitiveMarker }), res);
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(res.redirectTarget, "/admin?auth=failed");
  assert.equal(messages.some((message) => message.includes(sensitiveMarker)), false);
});
