import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { parse as parseCookies } from "cookie";
import { OAuth2Client } from "google-auth-library";

const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("base64url");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function futureIso(milliseconds) {
  return new Date(Date.now() + milliseconds).toISOString();
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function emailHasExactDomain(email, domain) {
  const separator = email.lastIndexOf("@");
  return separator > 0 &&
    email.indexOf("@") === separator &&
    email.slice(separator + 1) === domain;
}

function audienceMatches(value, expected) {
  return Array.isArray(value) ? value.includes(expected) : value === expected;
}

function profilePictureUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" && url.href.length <= 2_048 ? url.href : null;
  } catch {
    return null;
  }
}

export function createAuth({ config, database, googleClient: suppliedGoogleClient = undefined }) {
  const redirectUri = config.googleCallbackUrl;
  const googleClient = suppliedGoogleClient ?? (config.googleClientId && config.googleClientSecret
    ? new OAuth2Client(config.googleClientId, config.googleClientSecret, redirectUri)
    : null);

  function safeReturnPath(value) {
    try {
      const base = new URL(config.baseUrl);
      const target = new URL(String(value || "/admin"), base);
      const isAdminPath = target.pathname === "/admin" || target.pathname.startsWith("/admin/");
      if (target.origin !== base.origin || !isAdminPath) {
        return "/admin";
      }
      return `${target.pathname}${target.search}${target.hash}`;
    } catch {
      return "/admin";
    }
  }

  function requestHash(value, purpose) {
    if (!value) return null;
    return createHmac("sha256", config.logHashSecret)
      .update(`${purpose}:${value}`)
      .digest("base64url");
  }

  function clientIpHash(request) {
    return requestHash(request.ip || request.socket?.remoteAddress || "", "ip");
  }

  function sessionCookie(request) {
    try {
      return parseCookies(request.headers.cookie || "")[config.cookieName] || "";
    } catch {
      return "";
    }
  }

  function oauthCookie(request) {
    try {
      return parseCookies(request.headers.cookie || "")[config.oauthCookieName] || "";
    } catch {
      return "";
    }
  }

  function oauthBinding(state) {
    return createHmac("sha256", config.logHashSecret)
      .update(`oauth-state:${state}`)
      .digest("base64url");
  }

  function csrfForSessionToken(sessionToken) {
    return createHmac("sha256", config.csrfSecret)
      .update(`csrf:${sessionToken}`)
      .digest("base64url");
  }

  function setSessionCookie(response, token) {
    response.cookie(config.cookieName, token, {
      httpOnly: true,
      secure: config.production,
      sameSite: "lax",
      path: "/",
      maxAge: config.sessionTtlMs
    });
  }

  function clearSessionCookie(response) {
    response.clearCookie(config.cookieName, {
      httpOnly: true,
      secure: config.production,
      sameSite: "lax",
      path: "/"
    });
  }

  function setOauthCookie(response, state) {
    response.cookie(config.oauthCookieName, oauthBinding(state), {
      httpOnly: true,
      secure: config.production,
      sameSite: "lax",
      path: "/",
      maxAge: config.oauthAttemptTtlMs
    });
  }

  function clearOauthCookie(response) {
    response.clearCookie(config.oauthCookieName, {
      httpOnly: true,
      secure: config.production,
      sameSite: "lax",
      path: "/"
    });
  }

  async function createSession(request, response, user) {
    const token = randomBytes(32).toString("base64url");
    await database.createSession({
      tokenHash: sha256(token),
      userId: user.id,
      expiresAt: futureIso(config.sessionTtlMs),
      userAgentHash: requestHash(request.get("user-agent") || "", "ua"),
      ipHash: clientIpHash(request)
    });
    setSessionCookie(response, token);
    return token;
  }

  async function optionalSession(request, _response, next) {
    const token = sessionCookie(request);
    if (!token) return next();
    const session = await database.getSession(sha256(token));
    if (session) {
      request.user = session.user;
      request.authSession = session;
      request.sessionToken = token;
    }
    next();
  }

  async function auditSafely(entry) {
    try {
      await database.audit(entry);
    } catch {
      // Authentication must not expose sensitive provider or session details if auditing fails.
      console.error("Authentication audit write failed.");
    }
  }

  function requireSession(request, response, next) {
    if (!request.user || !request.sessionToken) {
      return response.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    }
    next();
  }

  function verifyCsrf(request, response, next) {
    if (!request.user || !request.sessionToken) {
      return response.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    }
    const supplied = request.get("x-csrf-token") || "";
    const expected = csrfForSessionToken(request.sessionToken);
    if (!supplied || !safeEqual(supplied, expected)) {
      return response.status(403).json({ error: "CSRF_VALIDATION_FAILED" });
    }
    next();
  }

  function sessionPayload(request) {
    if (!request.user) {
      return {
        authenticated: false,
        loginUrl: "/api/staff/auth/google"
      };
    }
    return {
      authenticated: true,
      csrfToken: csrfForSessionToken(request.sessionToken),
      user: request.user
    };
  }

  async function beginGoogleLogin(request, response) {
    if (!googleClient) {
      return response.redirect("/admin?auth=unavailable");
    }
    await database.pruneExpired();
    const state = randomBytes(32).toString("base64url");
    const codeVerifier = randomBytes(48).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");
    await database.createOauthAttempt({
      stateHash: sha256(state),
      codeVerifier,
      nonce,
      redirectPath: safeReturnPath(request.query.returnTo),
      expiresAt: futureIso(config.oauthAttemptTtlMs)
    });
    const codeChallenge = sha256(codeVerifier);
    const authorizationUrl = googleClient.generateAuthUrl({
      access_type: "online",
      scope: ["openid", "email", "profile"],
      state,
      nonce,
      hd: config.allowedGoogleDomain,
      prompt: "select_account",
      code_challenge: codeChallenge,
      code_challenge_method: "S256"
    });
    setOauthCookie(response, state);
    response.redirect(authorizationUrl);
  }

  async function completeGoogleLogin(request, response) {
    const state = String(request.query.state ?? "");
    const code = String(request.query.code ?? "");
    if (!googleClient || !state || !code) {
      return response.redirect("/admin?auth=failed");
    }
    const suppliedBinding = oauthCookie(request);
    const expectedBinding = oauthBinding(state);
    if (!suppliedBinding || !safeEqual(suppliedBinding, expectedBinding)) {
      return response.redirect("/admin?auth=failed");
    }
    clearOauthCookie(response);
    const attempt = await database.consumeOauthAttempt(sha256(state));
    if (!attempt) {
      return response.redirect("/admin?auth=expired");
    }
    try {
      const { tokens } = await googleClient.getToken({
        code,
        codeVerifier: attempt.codeVerifier,
        redirect_uri: redirectUri
      });
      if (!tokens.id_token) throw new Error("Google did not return an ID token.");
      const ticket = await googleClient.verifyIdToken({
        idToken: tokens.id_token,
        audience: config.googleClientId
      });
      const payload = ticket.getPayload();
      const email = normalizeEmail(payload?.email);
      const googleSubjectId = String(payload?.sub ?? "").trim();
      const expiresAtSeconds = Number(payload?.exp ?? 0);
      const authorizedIdentity = Boolean(
        payload &&
        GOOGLE_ISSUERS.has(payload.iss) &&
        audienceMatches(payload.aud, config.googleClientId) &&
        payload.email_verified === true &&
        payload.nonce === attempt.nonce &&
        googleSubjectId &&
        emailHasExactDomain(email, config.allowedGoogleDomain) &&
        expiresAtSeconds * 1000 > Date.now()
      );
      const allowedByList = config.allowedStaffEmails.size === 0 || config.allowedStaffEmails.has(email);
      if (!authorizedIdentity || !allowedByList) {
        await auditSafely({
          user: email ? { email } : null,
          action: "LOGIN_REJECTED",
          metadata: { reason: "workspace_identity_not_authorized" },
          ipHash: clientIpHash(request)
        });
        return response.redirect("/admin?auth=denied");
      }
      const suppliedName = String(payload.name ?? "").trim();
      const user = await database.upsertUser({
        googleSubjectId,
        email,
        name: (suppliedName || email.split("@")[0]).slice(0, 160),
        profilePictureUrl: profilePictureUrl(payload.picture),
        role: config.adminEmails.has(email) ? "admin" : "member"
      });
      await createSession(request, response, user);
      await auditSafely({ user, action: "LOGIN_SUCCESS", ipHash: clientIpHash(request) });
      response.redirect(attempt.redirectPath);
    } catch {
      // Provider errors can contain authorization codes or tokens, so log no error details here.
      console.error("Google OAuth callback failed.");
      response.redirect("/admin?auth=failed");
    }
  }

  async function logout(request, response) {
    try {
      if (request.sessionToken) {
        await database.deleteSession(sha256(request.sessionToken));
        await auditSafely({ user: request.user, action: "LOGOUT", ipHash: clientIpHash(request) });
      }
    } finally {
      clearSessionCookie(response);
    }
    response.status(204).end();
  }

  return {
    beginGoogleLogin,
    completeGoogleLogin,
    optionalSession,
    requireSession,
    verifyCsrf,
    sessionPayload,
    logout,
    clientIpHash,
    createSessionForTest: createSession
  };
}
