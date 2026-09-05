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

test("members manage their own news and expenses without finance or publication permissions", () => {
  const ownExpense = submission("expense", member.id);
  const otherExpense = submission("expense", "someone-else");
  const historicalOwnNews = submission("news", member.id);
  const historicalOwnInvoice = submission("invoice", member.id);

  assert.equal(canCreateType(member, "expense"), true);
  assert.equal(canCreateType(member, "news"), true);
  assert.equal(canCreateType(member, "invoice"), false);

  assert.equal(canReadSubmission(member, ownExpense), true);
  assert.equal(canEditSubmission(member, ownExpense), true);
  assert.equal(canSubmitSubmission(member, ownExpense), true);
  assert.equal(canReadAttachment(member, ownExpense), true);

  assert.equal(canReadSubmission(member, otherExpense), false);
  assert.equal(canReadAttachment(member, otherExpense), false);
  assert.equal(canReadSubmission(member, historicalOwnNews), true);
  assert.equal(canEditSubmission(member, historicalOwnNews), true);
  assert.equal(canSubmitSubmission(member, historicalOwnNews), true);
  assert.equal(canReadSubmission(member, submission("news", "other")), false);
  assert.equal(canReviewType(member, "news"), false);
  assert.equal(canReviewType(member, "expense"), false);
  assert.equal(canReadSubmission(member, historicalOwnInvoice), false);
  assert.equal(canSubmitSubmission(member, historicalOwnInvoice), false);

  const permissions = permissionsForRole("member");
  assert.ok(permissions.includes("expense:read:own"));
  assert.ok(permissions.includes("news:create"));
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

test("finance can review submitted expenses while invoice creation requires the designated email", () => {
  const otherExpense = submission("expense", member.id, "SUBMITTED");
  const ownInvoice = submission("invoice", finance.id);
  const otherInvoice = submission("invoice", admin.id);

  assert.equal(canCreateType(finance, "invoice"), false);
  assert.equal(canReviewType(finance, "expense"), true);
  assert.equal(canReviewType(finance, "news"), false);
  assert.equal(canReadSubmission(finance, otherExpense), true);
  assert.equal(canReadAttachment(finance, otherExpense), true);
  assert.equal(canReadSubmission(finance, ownInvoice), false);
  assert.equal(canEditSubmission(finance, ownInvoice), false);
  assert.equal(canReadSubmission(finance, otherInvoice), false);
  assert.equal(canReadAttachment(finance, otherInvoice), false);
});

test("only the designated invoice email can create and edit its own invoice drafts", () => {
  const owner = { ...member, email: "finance@noortetugi.ee" };
  const context = { invoiceCreatorEmail: "finance@noortetugi.ee" };
  const ownInvoice = submission("invoice", owner.id);
  assert.equal(canCreateType(owner, "invoice", context), true);
  assert.equal(canReadSubmission(owner, ownInvoice, context), true);
  assert.equal(canEditSubmission(owner, ownInvoice, context), true);
  assert.equal(canSubmitSubmission(owner, ownInvoice, context), true);
  assert.equal(canEditSubmission(owner, submission("invoice", admin.id), context), false);
  assert.equal(canEditSubmission(owner, submission("invoice", owner.id, "SUBMITTED"), context), false);
  assert.equal(canCreateType({ ...owner, email: "other@noortetugi.ee" }, "invoice", context), false);
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
