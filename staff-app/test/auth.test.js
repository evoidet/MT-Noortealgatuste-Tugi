import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
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
    oauthCookieName: "__Host-noortetugi_oauth",
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
    headers: {
      "user-agent": "test-agent",
      ...(query.state ? {
        cookie: `${config().oauthCookieName}=${createHmac("sha256", config().logHashSecret)
          .update(`oauth-state:${query.state}`).digest("base64url")}`
      } : {})
    },
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
  assert.equal(db.calls.sessions[0].tokenHash, sha256(res.cookies[0].value));
  assert.notEqual(db.calls.sessions[0].tokenHash, res.cookies[0].value);
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

test("OAuth callback requires the state binding cookie from the initiating browser", async (t) => {
  for (const cookie of ["", "__Host-noortetugi_oauth=wrong-binding"]) {
    await t.test(cookie ? "mismatched binding" : "missing binding", async () => {
      let consumed = false;
      const db = database({ async consumeOauthAttempt() { consumed = true; return null; } });
      const google = googleClient(validPayload());
      const auth = createAuth({ config: config(), database: db, googleClient: google });
      const req = request({ state: "state", code: "code" });
      req.headers.cookie = cookie;
      const res = response();
      await auth.completeGoogleLogin(req, res);
      assert.equal(res.redirectTarget, "/admin?auth=failed");
      assert.equal(consumed, false);
      assert.equal(google.calls.tokenOptions, null);
      assert.equal(db.calls.sessions.length, 0);
    });
  }
});

test("OAuth callback rejects incorrect nonce, audience, issuer, and expired identity", async (t) => {
  for (const [name, claims] of [
    ["nonce", { nonce: "another-attempt" }],
    ["audience", { aud: "another-client" }],
    ["issuer", { iss: "https://attacker.example" }],
    ["expiration", { exp: Math.floor(Date.now() / 1_000) - 60 }]
  ]) {
    await t.test(name, async () => {
      const db = database();
      const auth = createAuth({ config: config(), database: db, googleClient: googleClient(validPayload(claims)) });
      const res = response();
      await auth.completeGoogleLogin(request({ state: "state", code: "code" }), res);
      assert.equal(res.redirectTarget, "/admin?auth=denied");
      assert.equal(db.calls.sessions.length, 0);
    });
  }
});

test("existing sessions immediately lose access after domain or email allowlist changes", async (t) => {
  for (const [name, overrides] of [
    ["domain", { allowedGoogleDomain: "another.example" }],
    ["allowlist", { allowedStaffEmails: new Set(["other@noortetugi.ee"]) }]
  ]) {
    await t.test(name, async () => {
      let deletedHash;
      const db = database({
        async getSession() { return { user: { id: "user-1", email: "member@noortetugi.ee", role: "member" } }; },
        async deleteSession(value) { deletedHash = value; }
      });
      const auth = createAuth({ config: config(overrides), database: db });
      const req = request();
      req.headers.cookie = `${config().cookieName}=test-session-token`;
      const res = response();
      let nextCalls = 0;
      await auth.optionalSession(req, res, () => { nextCalls += 1; });
      assert.equal(req.user, undefined);
      assert.equal(req.sessionToken, undefined);
      assert.equal(deletedHash, sha256("test-session-token"));
      assert.equal(res.clearedCookies[0].name, config().cookieName);
      assert.equal(nextCalls, 1);
    });
  }
});

test("removing an admin email removes admin privileges from its active session", async () => {
  const db = database({
    async getSession() { return { user: { id: "user-1", email: "member@noortetugi.ee", role: "admin" } }; }
  });
  const auth = createAuth({ config: config(), database: db });
  const req = request();
  req.headers.cookie = `${config().cookieName}=test-session-token`;
  await auth.optionalSession(req, response(), () => {});
  assert.equal(req.user.role, "member");
  assert.equal(req.authSession.user.role, "member");
});

test("session policy preserves allowed admin, finance, and editor roles", async (t) => {
  for (const role of ["admin", "finance", "editor"]) {
    await t.test(role, async () => {
      const db = database({
        async getSession() { return { user: { id: "user-1", email: "member@noortetugi.ee", role } }; }
      });
      const auth = createAuth({ config: config({ adminEmails: new Set(["member@noortetugi.ee"]) }), database: db });
      const req = request();
      req.headers.cookie = `${config().cookieName}=test-session-token`;
      await auth.optionalSession(req, response(), () => {});
      assert.equal(req.user.role, role);
    });
  }
});

test("CSRF tokens are bound to the authenticated session", async () => {
  const db = database({
    async getSession() { return { user: { id: "user-1", email: "member@noortetugi.ee", role: "member" } }; }
  });
  const auth = createAuth({ config: config(), database: db });
  const req = request();
  req.headers.cookie = `${config().cookieName}=test-session-token`;
  await auth.optionalSession(req, response(), () => {});
  const token = auth.sessionPayload(req).csrfToken;
  const missing = response();
  auth.verifyCsrf(req, missing, () => assert.fail("missing token must fail"));
  assert.equal(missing.statusCode, 403);
  req.headers["x-csrf-token"] = token;
  let accepted = false;
  auth.verifyCsrf(req, response(), () => { accepted = true; });
  assert.equal(accepted, true);
  req.sessionToken = "different-session-token";
  const replay = response();
  auth.verifyCsrf(req, replay, () => assert.fail("cross-session token must fail"));
  assert.equal(replay.statusCode, 403);
});
