import OpenAI from "openai";
import { createStaffApp } from "../../src/app.js";
import { createAiAssistant } from "../../src/ai.js";
import { loadConfig } from "../../src/config.js";

export const original = "Meie üritus toimus eile ja seal osales palju noored. Üritus oli väga tore ja inimesed sai palju uusi teadmisi.";
export const corrected = "Meie üritus toimus eile ja seal osales palju noori. Üritus oli väga tore ja inimesed said palju uusi teadmisi.";

// Real application, auth/CSRF, AI service and SDK; all external dependencies are replaced.
export function aiFixture({ missingKey = false } = {}) {
  const config = loadConfig({ environment: "test", appUrl: "http://localhost:3100",
    googleCallbackUrl: "http://localhost:3100/api/staff/auth/google/callback", storageDatabaseUrl: "postgresql://unused.invalid/test",
    blobReadWriteToken: "test-only", sessionSecret: "s".repeat(48), allowedGoogleDomain: "noortetugi.ee",
    allowedStaffEmails: [], adminEmails: [], googleClientId: "", googleClientSecret: "", openAiApiKey: "",
    openAiModel: "gpt-5-mini", smtpHost: "", smtpUser: "", smtpPassword: "", mailFrom: "",
    googleDriveArchiveEnabled: false, enableDevAuth: false });
  const state = { behavior: "success", delay: 0, calls: [], drafts: new Map(), audits: [] };
  const user = { id: "ai-test-user", email: "ai-test@noortetugi.ee", name: "Synthetic Writer", role: "member" };
  const database = {
    async getSession(tokenHash) { return { user: { ...user, id: tokenHash } }; },
    async healthCheck() { return true; }, async assertSubmissionSchema() {},
    async audit(entry) { state.audits.push(entry); },
    async listSubmissionsByCreator() { return [...state.drafts.values()]; },
    async createSubmission({ type, data, creatorId }) {
      const item = { id: `ai-draft-${state.drafts.size + 1}`, type, data, creatorId, status: "DRAFT" };
      state.drafts.set(item.id, item); return item;
    },
    async getSubmission(id) { return state.drafts.get(id); },
    async listAttachments() { return []; }, async listReviews() { return []; }
  };
  const client = new OpenAI({ apiKey: "synthetic-not-a-real-key", baseURL: "https://ai.invalid/v1",
    fetch: async (url, options) => {
      if (String(url) !== "https://ai.invalid/v1/responses") throw new Error("Unexpected provider URL");
      const body = JSON.parse(String(options.body));
      state.calls.push({ ...body, input: JSON.parse(body.input) });
      const behavior = state.behavior;
      if (state.delay) await new Promise((resolve) => setTimeout(resolve, state.delay));
      if (behavior === "malformed") return new Response("not JSON", { headers: { "content-type": "application/json" } });
      if (behavior !== "success" && behavior !== "empty" && behavior !== "incomplete") {
        const status = { authentication: 401, rate_limit: 429, invalid_request: 400, provider_error: 500 }[behavior] || 500;
        return Response.json({ error: { message: "PRIVATE_PROVIDER_DETAIL", code: "invalid_api_key" } },
          { status, headers: { "x-request-id": "req_synthetic_test" } });
      }
      return Response.json({ id: "resp_synthetic", object: "response", status: behavior === "incomplete" ? "incomplete" : "completed",
        incomplete_details: behavior === "incomplete" ? { reason: "max_output_tokens" } : null,
        output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: behavior === "empty" ? "" : corrected, annotations: [] }] }]
      });
    } });
  const aiAssistant = missingKey ? createAiAssistant(config) : createAiAssistant(config, { client });
  const { app } = createStaffApp({ config, database, aiAssistant,
    mailService: { available: false, async sendExpenseSubmitted() { throw new Error("No mail allowed"); } } });
  return { app, config, state };
}
