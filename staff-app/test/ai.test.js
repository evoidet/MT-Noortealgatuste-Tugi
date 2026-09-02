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

test("correctExpense concurrently corrects only whitelisted prose and preserves structured facts", async () => {
  let activeCalls = 0;
  let maximumActiveCalls = 0;
  const client = fakeClient(async ({ text }) => {
    activeCalls += 1;
    maximumActiveCalls = Math.max(maximumActiveCalls, activeCalls);
    await new Promise((resolve) => setImmediate(resolve));
    activeCalls -= 1;
    return text.replace("vigane", "parandatud");
  });
  const assistant = assistantWith(client);
  const original = {
    documentNumber: "KA-2026-042",
    date: "2026-09-02",
    project: "Projekt PRJ-42",
    person: "Mari Maasikas",
    email: "mari@example.ee",
    phone: "+372 5555 1234",
    amount: 125.5,
    activity: "vigane tegevuse kirjeldus",
    purpose: "vigane eesmärgi kirjeldus",
    goal: "vigane eesmärgi kirjeldus",
    result: "vigane tulemuse kirjeldus",
    necessity: "Kulu oli vajalik.",
    participants: "12 noort",
    location: "Tallinn",
    items: [{
      date: "2026-09-01",
      documentNumber: "TSEKK-19",
      vendor: "Näide OÜ",
      description: "Materjalid",
      amount: 125.5,
      currency: "EUR"
    }]
  };
  const originalSnapshot = structuredClone(original);

  const corrected = await assistant.correctExpense(original);

  assert.ok(maximumActiveCalls > 1, "expense prose corrections should start concurrently");
  assert.deepEqual(corrected.correctedFields, ["activity", "purpose", "goal", "result"]);
  assert.equal(corrected.data.activity, "parandatud tegevuse kirjeldus");
  assert.equal(corrected.data.purpose, "parandatud eesmärgi kirjeldus");
  assert.equal(corrected.data.goal, "parandatud eesmärgi kirjeldus");
  assert.equal(corrected.data.result, "parandatud tulemuse kirjeldus");
  assert.equal(corrected.data.documentNumber, original.documentNumber);
  assert.equal(corrected.data.date, original.date);
  assert.equal(corrected.data.project, original.project);
  assert.equal(corrected.data.person, original.person);
  assert.equal(corrected.data.email, original.email);
  assert.equal(corrected.data.phone, original.phone);
  assert.equal(corrected.data.amount, original.amount);
  assert.strictEqual(corrected.data.items, original.items);
  assert.deepEqual(corrected.data.items, originalSnapshot.items);
  assert.deepEqual(original, originalSnapshot, "the source expense must not be mutated");
  assert.deepEqual(
    [...new Set(client.calls.map((call) => JSON.parse(call.input).field))],
    ["expense.activity", "expense.goal", "expense.result", "expense.necessity", "expense.participants"]
  );
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
    () => assistant.correctExpense({ activity: "Tekst" }),
    (error) => error?.code === "AI_UNAVAILABLE"
  );
});
