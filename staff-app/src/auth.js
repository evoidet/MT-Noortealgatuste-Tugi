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

export function createAuth({ config, database }) {
  const redirectUri = `${config.baseUrl}/api/staff/auth/google/callback`;
  const googleClient = config.googleClientId && config.googleClientSecret
    ? new OAuth2Client(config.googleClientId, config.googleClientSecret, redirectUri)
    : null;

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

  function createSession(request, response, user) {
    const token = randomBytes(32).toString("base64url");
    database.createSession({
      tokenHash: sha256(token),
      userId: user.id,
      expiresAt: futureIso(config.sessionTtlMs),
      userAgentHash: requestHash(request.get("user-agent") || "", "ua"),
      ipHash: clientIpHash(request)
    });
    setSessionCookie(response, token);
    return token;
  }

  function optionalSession(request, _response, next) {
    const token = sessionCookie(request);
    if (!token) return next();
    const session = database.getSession(sha256(token));
    if (session) {
      request.user = session.user;
      request.authSession = session;
      request.sessionToken = token;
    }
    next();
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
    database.pruneExpired();
    const state = randomBytes(32).toString("base64url");
    const codeVerifier = randomBytes(48).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");
    database.createOauthAttempt({
      stateHash: sha256(state),
      codeVerifier,
      nonce,
      redirectPath: "/admin",
      expiresAt: futureIso(config.oauthAttemptTtlMs)
    });
    const codeChallenge = sha256(codeVerifier);
    const authorizationUrl = googleClient.generateAuthUrl({
      access_type: "online",
      scope: ["openid", "email", "profile"],
      state,
      nonce,
      hd: config.googleWorkspaceDomain,
      prompt: "select_account",
      code_challenge: codeChallenge,
      code_challenge_method: "S256"
    });
    response.redirect(authorizationUrl);
  }

  async function completeGoogleLogin(request, response) {
    const state = String(request.query.state ?? "");
    const code = String(request.query.code ?? "");
    if (!googleClient || !state || !code) {
      return response.redirect("/admin?auth=failed");
    }
    const attempt = database.consumeOauthAttempt(sha256(state));
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
      const expiresAtSeconds = Number(payload?.exp ?? 0);
      const authorizedIdentity = Boolean(
        payload &&
        GOOGLE_ISSUERS.has(payload.iss) &&
        payload.aud === config.googleClientId &&
        payload.email_verified === true &&
        payload.nonce === attempt.nonce &&
        payload.hd === config.googleWorkspaceDomain &&
        email.endsWith(`@${config.googleWorkspaceDomain}`) &&
        expiresAtSeconds * 1000 > Date.now()
      );
      const allowedByList = config.allowedEmails.size === 0 || config.allowedEmails.has(email);
      if (!authorizedIdentity || !allowedByList) {
        database.audit({
          user: email ? { email } : null,
          action: "LOGIN_REJECTED",
          metadata: { reason: "workspace_identity_not_authorized" },
          ipHash: clientIpHash(request)
        });
        return response.redirect("/admin?auth=denied");
      }
      const user = database.upsertUser({
        email,
        name: String(payload.name || email.split("@")[0]).slice(0, 160),
        role: config.roleMap.get(email) ?? config.defaultRole
      });
      createSession(request, response, user);
      database.audit({ user, action: "LOGIN_SUCCESS", ipHash: clientIpHash(request) });
      response.redirect(attempt.redirectPath);
    } catch (error) {
      console.error("Google OAuth callback failed:", error?.message || "unknown error");
      response.redirect("/admin?auth=failed");
    }
  }

  function logout(request, response) {
    if (request.sessionToken) {
      database.deleteSession(sha256(request.sessionToken));
      database.audit({ user: request.user, action: "LOGOUT", ipHash: clientIpHash(request) });
    }
    clearSessionCookie(response);
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

