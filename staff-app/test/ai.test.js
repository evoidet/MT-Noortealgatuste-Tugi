import assert from "node:assert/strict";
import test from "node:test";

import { createAiAssistant } from "../src/ai.js";

function fakeClient(transform = ({ text }) => text) {
  const calls = [];
  return {
    calls,
    responses: {
      async create(request) {
        calls.push(request);
        const input = JSON.parse(request.input);
        return {
          status: "completed",
          output_text: await transform({ ...input, request, callIndex: calls.length - 1 })
        };
      }
    }
  };
}

function assistantWith(client) {
  return createAiAssistant({ openAiApiKey: "", openAiModel: "test-model" }, { client });
}

test("AI assistant executes an injected Responses client without storing the response", async () => {
  const client = fakeClient(({ text }) => text.replace("vigane", "parandatud"));
  const assistant = assistantWith(client);

  const suggestion = await assistant.improve({
    text: "vigane tekst",
    field: "expense.activity",
    mode: "fix_language",
    language: "et"
  });

  assert.equal(assistant.available, true);
  assert.equal(suggestion, "parandatud tekst");
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].model, "test-model");
  assert.equal(client.calls[0].store, false);
  assert.equal(client.calls[0].max_output_tokens, 1_200);
  assert.deepEqual(JSON.parse(client.calls[0].input), {
    field: "expense.activity",
    text: "vigane tekst"
  });
});

test("non-completed Responses output is rejected even when partial text is present", async () => {
  const client = fakeClient();
  client.responses.create = async () => ({
    status: "incomplete",
    incomplete_details: { reason: "max_output_tokens" },
    output_text: "Partial but non-empty correction"
  });
  const assistant = assistantWith(client);

  await assert.rejects(
    () => assistant.improve({
      text: "Original text",
      field: "expense.activity",
      mode: "fix_language",
      language: "et"
    }),
    (error) => error?.code === "AI_INCOMPLETE_RESPONSE"
  );
});

test("protected financial, date, identifier and contact facts cannot be changed", async (t) => {
  const cases = [
    ["signed amount", "Kulu oli -10 EUR.", "Kulu oli 10 EUR."],
    ["currency", "Kulu oli 10 EUR.", "Kulu oli 10 USD."],
    ["currency symbol", "Kulu oli 10 €.", "Kulu oli 10 $."],
    ["date", "Kohtumine toimus 2026-09-02.", "Kohtumine toimus 2026-09-03."],
    ["identifier", "Projekt oli KA-2026-042.", "Projekt oli KB-2026-042."],
    ["email", "Kontakt on mari@example.ee.", "Kontakt on mati@example.ee."],
    ["phone", "Telefon on +372 5555 1234.", "Telefon on +372 5555 1235."],
    ["IBAN", "IBAN on EE382200221020145685.", "IBAN on EE382200221020145686."]
  ];

  for (const [name, original, changed] of cases) {
    await t.test(name, async () => {
      const assistant = assistantWith(fakeClient(() => changed));
      await assert.rejects(
        () => assistant.improve({
          text: original,
          field: "expense.activity",
          mode: "fix_language",
          language: "et"
        }),
        (error) => error?.code === "AI_FACT_GUARD_REJECTED"
      );
    });
  }
});

test("missing AI configuration remains an explicit service error", async () => {
  const assistant = createAiAssistant({ openAiApiKey: "", openAiModel: "test-model" });

  assert.equal(assistant.available, false);
  await assert.rejects(
    () => assistant.improve({
      text: "Tekst",
      field: "expense.activity",
      mode: "fix_language",
      language: "et"
    }),
    (error) => error?.code === "AI_UNAVAILABLE"
  );
});
