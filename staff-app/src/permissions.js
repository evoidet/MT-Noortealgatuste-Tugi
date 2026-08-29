export const ROLES = Object.freeze(["member", "editor", "finance", "admin"]);

const ownSubmissionPermissions = [
  "submission:read:own",
  "submission:update:own",
  "submission:submit:own",
  "attachment:manage:own"
];

const rolePermissions = Object.freeze({
  member: new Set(["expense:create", ...ownSubmissionPermissions]),
  editor: new Set(["expense:create", "news:create", ...ownSubmissionPermissions]),
  finance: new Set([
    "expense:create",
    "news:create",
    "invoice:create",
    "expense:review",
    "expense:read:all",
    "attachment:read:expense",
    ...ownSubmissionPermissions
  ]),
  admin: new Set([
    "expense:create",
    "news:create",
    "invoice:create",
    "expense:review",
    "news:review",
    "invoice:read:all",
    "expense:read:all",
    "news:read:all",
    "attachment:read:all",
    "audit:read",
    "news:export",
    ...ownSubmissionPermissions
  ])
});

export function permissionsForRole(role) {
  return [...(rolePermissions[role] ?? rolePermissions.member)].sort();
}

export function hasPermission(user, permission) {
  return Boolean(user && rolePermissions[user.role]?.has(permission));
}

export function canCreateType(user, type) {
  return hasPermission(user, `${type}:create`);
}

export function canReviewType(user, type) {
  return hasPermission(user, `${type}:review`);
}

export function canReadSubmission(user, submission) {
  if (!user || !submission) return false;
  if (submission.creatorId === user.id && hasPermission(user, "submission:read:own")) return true;
  return hasPermission(user, `${submission.type}:read:all`) || canReviewType(user, submission.type);
}

export function canEditSubmission(user, submission) {
  if (!canReadSubmission(user, submission)) return false;
  if (submission.creatorId !== user.id || !hasPermission(user, "submission:update:own")) return false;
  return ["DRAFT", "NEEDS_CHANGES"].includes(submission.status);
}

export function canSubmitSubmission(user, submission) {
  return canEditSubmission(user, submission) && hasPermission(user, "submission:submit:own");
}

export function canReadAttachment(user, submission) {
  if (!canReadSubmission(user, submission)) return false;
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

