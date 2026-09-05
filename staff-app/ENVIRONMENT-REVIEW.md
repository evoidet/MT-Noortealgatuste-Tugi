# Staff environment and authentication review

This review inspected application source and synthetic local tests. No environment files, deployed environment values, credentials, session tokens, or external provider accounts were inspected. Provider credential validity and deployed configuration remain part of the production smoke test.

## Environment structure

“Production” means required when the staff service starts in production mode. “Command” means required only by the named maintenance command. Every variable below is accessed exclusively by server code or a maintenance script; none is imported by the staff browser modules or copied from server source into the public build.

| Variable name | Application use | Required | Validation |
| --- | --- | --- | --- |
| `STORAGE_DATABASE_URL` | Runtime PostgreSQL connection | Production | Startup and database-opening presence checks; connection validity is checked by PostgreSQL at runtime |
| `STORAGE_DATABASE_URL_UNPOOLED` | Migration, import, and delivery-recovery scripts | Command | Presence checks before connecting; connection validity is checked by PostgreSQL |
| `GOOGLE_CLIENT_ID` | OAuth client and ID-token audience verification | Production | Startup presence; audience verification during callback |
| `GOOGLE_CLIENT_SECRET` | OAuth authorization-code exchange | Production | Startup presence; Google validates credentials during exchange |
| `GOOGLE_CALLBACK_URL` | OAuth redirect and callback | Production | Absolute credential-free URL; exact callback route; HTTPS and same application origin in production |
| `APP_URL` | Canonical application origin and staff links | Production | Absolute credential-free HTTP(S) URL, no query or fragment, HTTPS in production |
| `PUBLIC_SITE_ORIGIN` | Legacy configuration property; no current runtime consumer | Optional | Canonical URL validation; errors now identify this variable correctly |
| `SESSION_SECRET` | Session-related CSRF, OAuth-binding, and request-hash derivation | Production | Startup presence and minimum byte length |
| `ALLOWED_GOOGLE_DOMAIN` | Exact Google identity email-domain restriction | Optional | Domain normalization and syntax validation; enforced at callback and for existing sessions |
| `ALLOWED_STAFF_EMAILS` | Additional exact email allowlist | Optional | Entries must belong to the allowed domain; callback and existing-session checks |
| `ADMIN_EMAILS` | Administrator assignment and active-session authorization | Optional | Entries must belong to the allowed domain; removed administrator entries immediately lose elevated session permissions |
| `BLOB_READ_WRITE_TOKEN` | Private Blob server operations and scoped grants | Production | Startup presence; provider validates token at runtime |
| `OPENAI_API_KEY` | Optional AI text improvement | Optional | Presence gates availability; OpenAI validates credentials at runtime |
| `OPENAI_MODEL` | AI model selection | Optional | Nonempty identifier without whitespace; OpenAI validates model availability at runtime |
| `STAFF_SESSION_TTL_HOURS` | Session expiration | Optional | Strict whole-number and bounded-range validation |
| `STAFF_MAX_UPLOAD_MB` | Upload size limit | Optional | Strict whole-number/range validation; declared and actual size checks at upload |
| `STAFF_TRUST_PROXY` | Trusted reverse-proxy hop count | Optional | Strict whole-number and bounded-range validation |
| `FINANCE_NOTIFICATION_EMAIL` | Notification recipient and designated invoice owner | Production | Startup presence and valid mailbox in the allowed domain |
| `STAFF_SMTP_HOST` | SMTP connection host | Production | Presence and basic hostname validation |
| `STAFF_SMTP_PORT` | SMTP connection port | Optional | Strict whole-number and valid-port-range validation |
| `STAFF_SMTP_SECURE` | Direct SMTP TLS mode | Optional | Strict boolean validation |
| `STAFF_SMTP_REQUIRE_TLS` | Required SMTP STARTTLS mode | Optional | Strict boolean validation |
| `STAFF_SMTP_USER` | Authenticated SMTP identity | Production | Presence and paired-credential checks |
| `STAFF_SMTP_PASSWORD` | SMTP authentication | Production | Presence and paired-credential checks; never logged |
| `STAFF_MAIL_FROM` | Notification sender | Production | Actual variable is now required in production; mailbox syntax validation |
| `STAFF_MAIL_CONNECTION_TIMEOUT_MS` | SMTP connection, greeting, and socket timeouts | Optional | Strict whole-number and bounded-range validation |

`STAFF_ALLOWED_EMAILS` and `STAFF_SMTP_PASS` remain compatibility aliases. `ALLOWED_STAFF_EMAILS` and `STAFF_SMTP_PASSWORD` take precedence. Their values were not inspected or changed. `PUBLIC_SITE_ORIGIN` remains accepted for compatibility, but currently has no effect beyond configuration validation; it is unnecessary for the current staff workflow.

No requested variable is client-exposed or incorrectly named. Remaining external checks concern deployed presence and provider acceptance, not a missing local validation rule: PostgreSQL connectivity, Google OAuth authorization, private Blob access, SMTP delivery, and optional OpenAI availability. These checks must not print configured values.

## Authentication and authorization findings

- Google login and callback routes are connected to the authentication implementation. OAuth attempts use random state, nonce, and PKCE, an expiring database record, and an HTTP-only browser-binding cookie. The callback requires that cookie before consuming the attempt.
- The callback checks the signed identity's issuer, intended audience, verified email, nonce, expiration, and exact allowed email domain. The optional staff allowlist applies on the server. The Google hosted-domain parameter remains a provider hint; the existing policy restricts verified email domains rather than adding a new requirement that all accounts carry a Google Workspace hosted-domain claim.
- Existing sessions now recheck the configured domain and staff allowlist. Excluded identities have their session removed and cookie cleared. An administrator removed from the administrator list immediately loses elevated permissions; permitted editor and finance roles remain intact.
- Session cookies are HTTP-only, secure in production, use the host-only cookie prefix in production, and use the SameSite policy appropriate for the OAuth redirect. Opaque random session tokens are stored only as hashes in PostgreSQL. Database session lookup rejects expired sessions rather than extending their absolute lifetime.
- Mutating staff routes require server-side session authentication and a CSRF token derived from the current session. Tokens from another session are rejected. OAuth cookies are independently bound to the login attempt. Staff responses use no-store caching and the service does not grant cross-origin browser access.
- Submission and attachment access checks use server-loaded user and submission records. Members can access only permitted submission types they own. Finance and administrator review access applies to submitted records, and the designated invoice email controls invoice creation and editing. Submitted documents are no longer editable through the draft API.
- OAuth failures log a fixed safe message rather than provider exception bodies. Configuration validation now reports variable names without echoing a configured domain or malformed origin. Server configuration remains outside the browser import graph and public asset tree.

## Local verification

The focused command `node --test staff-app/test/auth.test.js staff-app/test/config.test.js staff-app/test/permissions.test.js` passed all 42 tests. Coverage includes valid Google callback fixtures, missing/mismatched browser binding, issuer/audience/nonce/expiration failures, allowlist rejection and session revocation, administrator policy changes, hashed session storage, session-bound CSRF, restricted submission permissions, and safe configuration errors.

These are local tests with synthetic identities and mocked provider/database behavior. Live Google OAuth, production database sessions, and deployed environment configuration were not exercised by this review.
