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

test("AI request has a bounded timeout and no automatic provider retries", async () => {
  let options;
  const client = { responses: { async create(_request, requestOptions) {
    options = requestOptions;
    return { status: "completed", output_text: "Test text" };
  } } };
  await assistantWith(client).improve({ text: "Test text", field: "news.title", mode: "fix_language", language: "en" });
  assert.deepEqual(options, { timeout: 20_000, maxRetries: 0 });
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

test("malformed and oversized provider text is rejected instead of coerced or truncated", async () => {
  for (const output of [{ unexpected: true }, ["text"], 42, "a".repeat(10_001)]) {
    await assert.rejects(assistantWith(fakeClient(() => output)).improve({
      text: "Original text", field: "news.content", mode: "fix_language", language: "et"
    }), { code: "AI_INVALID_RESPONSE" });
  }
});

function newsOutput(sourceLanguage, source) {
  return JSON.stringify({
    sourceLanguage,
    et: { title: source.title.et, summary: source.summary.et, content: source.content.et, imageAlt: "" },
    ru: { title: source.title.ru, summary: source.summary.ru, content: source.content.ru, imageAlt: "" },
    en: { title: source.title.en, summary: source.summary.en, content: source.content.en, imageAlt: "" }
  });
}

test("news preparation detects each supported source language and returns all translations", async (t) => {
  const versions = {
    title: { et: "Üritus 12.10.2026", ru: "Мероприятие 12.10.2026", en: "Event 12.10.2026" },
    summary: { et: "", ru: "", en: "" },
    content: {
      et: ["Kohtume 12.10.2026. Lisainfo: https://example.test/info", "Õ ä ö ü."],
      ru: ["Встречаемся 12.10.2026. Подробнее: https://example.test/info", "Кириллица."],
      en: ["We meet on 12.10.2026. More: https://example.test/info", "English text."]
    }
  };
  for (const language of ["et", "ru", "en"]) {
    await t.test(language, async () => {
      const client = fakeClient(() => newsOutput(language, versions));
      const result = await assistantWith(client).prepareNews({
        title: versions.title[language], summary: "", content: versions.content[language]
      });
      assert.equal(result.sourceLanguage, language);
      assert.deepEqual(Object.keys(result), ["sourceLanguage", "et", "ru", "en"]);
      assert.equal(result.et.content.length, 2);
      assert.equal(client.calls[0].max_output_tokens, 48_000);
      assert.equal(client.calls[0].text.format.type, "json_schema");
      assert.deepEqual(JSON.parse(client.calls[0].input).content, versions.content[language]);
    });
  }
});

test("news preparation rejects malformed, incomplete, and fact-changing output", async () => {
  const input = { title: "Event 2026", summary: "", content: ["Visit https://example.test on 12.10.2026."] };
  await assert.rejects(assistantWith(fakeClient(() => "not json")).prepareNews(input),
    { code: "AI_INVALID_RESPONSE" });
  await assert.rejects(assistantWith(fakeClient(() => JSON.stringify({ sourceLanguage: "en" }))).prepareNews(input),
    { code: "AI_INCOMPLETE_RESPONSE" });
  const changed = {
    title: { et: "Üritus 2027", ru: "Событие 2027", en: "Event 2027" },
    summary: { et: "", ru: "", en: "" },
    content: {
      et: ["Vaata https://example.test 12.10.2026."],
      ru: ["Смотрите https://example.test 12.10.2026."],
      en: ["Visit https://example.test on 12.10.2026."]
    }
  };
  await assert.rejects(assistantWith(fakeClient(() => newsOutput("en", changed))).prepareNews(input),
    { code: "AI_FACT_GUARD_REJECTED" });

  const inventedOptionalFields = {
    title: { et: "Sündmus 2026", ru: "Событие 2026", en: "Event 2026" },
    summary: { et: "Uus kokkuvõte", ru: "Новое резюме", en: "New summary" },
    content: {
      et: ["Külasta https://example.test 12.10.2026."],
      ru: ["Посетите https://example.test 12.10.2026."],
      en: ["Visit https://example.test on 12.10.2026."]
    }
  };
  await assert.rejects(assistantWith(fakeClient(() => newsOutput("en", inventedOptionalFields))).prepareNews(input),
    { code: "AI_FACT_GUARD_REJECTED" });

  const removedUrl = structuredClone(changed);
  removedUrl.title = { et: input.title, ru: input.title, en: input.title };
  removedUrl.content.et = ["Külasta meid 12.10.2026."];
  await assert.rejects(assistantWith(fakeClient(() => newsOutput("en", removedUrl))).prepareNews(input),
    { code: "AI_FACT_GUARD_REJECTED" });
});
