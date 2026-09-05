export const ROLES = Object.freeze(["member", "editor", "finance", "admin"]);

const ownPermissions = (type) => [
  `${type}:read:own`,
  `${type}:update:own`,
  `${type}:submit:own`
];

const rolePermissions = Object.freeze({
  member: new Set(["expense:create", "news:create", ...ownPermissions("expense"), ...ownPermissions("news")]),
  editor: new Set([
    "expense:create",
    "news:create",
    ...ownPermissions("expense"),
    ...ownPermissions("news")
  ]),
  finance: new Set([
    "expense:create",
    "news:create",
    "expense:review",
    "expense:read:all",
    "attachment:read:expense",
    ...ownPermissions("expense"),
    ...ownPermissions("news")
  ]),
  admin: new Set([
    "expense:create",
    "news:create",
    "expense:review",
    "news:review",
    "invoice:read:all",
    "expense:read:all",
    "news:read:all",
    "attachment:read:all",
    "audit:read",
    "news:export",
    ...ownPermissions("expense"),
    ...ownPermissions("news")
  ])
});

const invoiceOwnerPermissions = Object.freeze([
  "invoice:create",
  ...ownPermissions("invoice")
]);

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function isInvoiceOwner(user, context = {}) {
  const configuredEmail = normalizeEmail(context.invoiceCreatorEmail);
  return Boolean(configuredEmail && normalizeEmail(user?.email) === configuredEmail);
}

export function permissionsForRole(role) {
  return [...(rolePermissions[role] ?? rolePermissions.member)].sort();
}

export function permissionsForUser(user, context = {}) {
  const permissions = new Set(rolePermissions[user?.role] ?? rolePermissions.member);
  if (isInvoiceOwner(user, context)) {
    invoiceOwnerPermissions.forEach((permission) => permissions.add(permission));
  }
  return [...permissions].sort();
}

export function hasPermission(user, permission, context = {}) {
  if (!user) return false;
  if (rolePermissions[user.role]?.has(permission)) return true;
  return isInvoiceOwner(user, context) && invoiceOwnerPermissions.includes(permission);
}

export function canCreateType(user, type, context = {}) {
  return hasPermission(user, `${type}:create`, context);
}

export function canReviewType(user, type) {
  return hasPermission(user, `${type}:review`);
}

export function canReadSubmission(user, submission, context = {}) {
  if (!user || !submission) return false;
  if (
    submission.creatorId === user.id &&
    hasPermission(user, `${submission.type}:read:own`, context)
  ) return true;
  if (["DRAFT", "NEEDS_CHANGES"].includes(submission.status)) return false;
  return hasPermission(user, `${submission.type}:read:all`) || canReviewType(user, submission.type);
}

export function canEditSubmission(user, submission, context = {}) {
  if (!canReadSubmission(user, submission, context)) return false;
  if (submission.type === "invoice" && !isInvoiceOwner(user, context)) return false;
  if (
    submission.creatorId !== user.id ||
    !hasPermission(user, `${submission.type}:update:own`, context)
  ) return false;
  return ["DRAFT", "NEEDS_CHANGES"].includes(submission.status);
}

export function canSubmitSubmission(user, submission, context = {}) {
  return canEditSubmission(user, submission, context) &&
    hasPermission(user, `${submission.type}:submit:own`, context);
}

export function canReadAttachment(user, submission, context = {}) {
  if (!canReadSubmission(user, submission, context)) return false;
  if (submission.creatorId === user.id) return true;
  return hasPermission(user, "attachment:read:all") || hasPermission(user, `attachment:read:${submission.type}`);
}

export function requirePermission(permission) {
  return (request, response, next) => {
    if (!hasPermission(request.user, permission)) {
      return response.status(403).json({ error: "FORBIDDEN" });
    }
    next();
  };
}
