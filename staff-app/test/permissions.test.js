import assert from "node:assert/strict";
import test from "node:test";

import {
  canCreateType,
  canEditSubmission,
  canReadAttachment,
  canReadSubmission,
  canReviewType,
  canSubmitSubmission,
  permissionsForRole,
} from "../src/permissions.js";

const member = Object.freeze({ id: "member-1", role: "member" });
const editor = Object.freeze({ id: "editor-1", role: "editor" });
const finance = Object.freeze({ id: "finance-1", role: "finance" });
const admin = Object.freeze({ id: "admin-1", role: "admin" });

function submission(type, creatorId, status = "DRAFT") {
  return { id: `${type}-${creatorId}`, type, creatorId, status };
}

test("member permissions are limited to the member's own expense reports", () => {
  const ownExpense = submission("expense", member.id);
  const otherExpense = submission("expense", "someone-else");
  const historicalOwnNews = submission("news", member.id);
  const historicalOwnInvoice = submission("invoice", member.id);

  assert.equal(canCreateType(member, "expense"), true);
  assert.equal(canCreateType(member, "news"), false);
  assert.equal(canCreateType(member, "invoice"), false);

  assert.equal(canReadSubmission(member, ownExpense), true);
  assert.equal(canEditSubmission(member, ownExpense), true);
  assert.equal(canSubmitSubmission(member, ownExpense), true);
  assert.equal(canReadAttachment(member, ownExpense), true);

  assert.equal(canReadSubmission(member, otherExpense), false);
  assert.equal(canReadAttachment(member, otherExpense), false);
  assert.equal(canReadSubmission(member, historicalOwnNews), false);
  assert.equal(canEditSubmission(member, historicalOwnNews), false);
  assert.equal(canReadSubmission(member, historicalOwnInvoice), false);
  assert.equal(canSubmitSubmission(member, historicalOwnInvoice), false);

  const permissions = permissionsForRole("member");
  assert.ok(permissions.includes("expense:read:own"));
  assert.equal(permissions.some((permission) => permission.startsWith("news:")), false);
  assert.equal(permissions.some((permission) => permission.startsWith("invoice:")), false);
  assert.equal(permissions.includes("submission:read:own"), false);
});

test("own submissions are editable only in draft and needs-changes states", () => {
  assert.equal(canEditSubmission(member, submission("expense", member.id, "DRAFT")), true);
  assert.equal(canEditSubmission(member, submission("expense", member.id, "NEEDS_CHANGES")), true);
  assert.equal(canEditSubmission(member, submission("expense", member.id, "SUBMITTED")), false);
  assert.equal(canEditSubmission(member, submission("expense", member.id, "APPROVED")), false);
  assert.equal(canSubmitSubmission(member, submission("expense", member.id, "REJECTED")), false);
});

test("editor can manage own news and expense submissions but cannot create invoices", () => {
  assert.equal(canCreateType(editor, "news"), true);
  assert.equal(canCreateType(editor, "expense"), true);
  assert.equal(canCreateType(editor, "invoice"), false);
  assert.equal(canReadSubmission(editor, submission("news", editor.id)), true);
  assert.equal(canEditSubmission(editor, submission("news", editor.id, "NEEDS_CHANGES")), true);
  assert.equal(canReviewType(editor, "news"), false);
  assert.equal(canReadSubmission(editor, submission("news", "another-editor")), false);
});

test("finance can review all expenses and manage only its own invoices", () => {
  const otherExpense = submission("expense", member.id, "SUBMITTED");
  const ownInvoice = submission("invoice", finance.id);
  const otherInvoice = submission("invoice", admin.id);

  assert.equal(canCreateType(finance, "invoice"), true);
  assert.equal(canReviewType(finance, "expense"), true);
  assert.equal(canReviewType(finance, "news"), false);
  assert.equal(canReadSubmission(finance, otherExpense), true);
  assert.equal(canReadAttachment(finance, otherExpense), true);
  assert.equal(canReadSubmission(finance, ownInvoice), true);
  assert.equal(canEditSubmission(finance, ownInvoice), true);
  assert.equal(canReadSubmission(finance, otherInvoice), false);
  assert.equal(canReadAttachment(finance, otherInvoice), false);
});

test("admin has all-submission read access and the intended review capabilities", () => {
  for (const type of ["expense", "news", "invoice"]) {
    const otherSubmission = submission(type, "another-user", "SUBMITTED");
    assert.equal(canReadSubmission(admin, otherSubmission), true);
    assert.equal(canReadAttachment(admin, otherSubmission), true);
  }

  assert.equal(canReviewType(admin, "expense"), true);
  assert.equal(canReviewType(admin, "news"), true);
  assert.equal(canReviewType(admin, "invoice"), false);
});
