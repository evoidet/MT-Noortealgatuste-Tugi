const SYSTEM_INSTRUCTIONS = `
You translate Estonian news for an official youth organisation and NGO website.

Translate only the requested fields into the requested target languages.
Preserve the original meaning and tone. Do not add facts or remove important
information. Keep names of people, organisations and projects accurate.
Preserve dates, addresses, prices, email addresses, phone numbers, URLs and
file paths. Preserve HTML tags, paragraphs, lists, headings, emphasis and links.
Do not translate URLs, file paths or HTML attribute names. Use natural,
professional Russian and English appropriate for a youth organisation.
Return only the structured data required by the supplied JSON schema.
`.trim();

const fieldSchema = (sourceValue) => (
  Array.isArray(sourceValue)
    ? {
        type: "array",
        items: { type: "string" },
        minItems: sourceValue.length,
        maxItems: sourceValue.length
      }
    : { type: "string", minLength: 1 }
);

function buildResponseSchema(source, requests) {
  const languageProperties = {};

  Object.entries(requests).forEach(([language, fields]) => {
    languageProperties[language] = {
      type: "object",
      additionalProperties: false,
      properties: Object.fromEntries(
        fields.map((field) => [field, fieldSchema(source[field])])
      ),
      required: fields
    };
  });

  return {
    type: "object",
    additionalProperties: false,
    properties: {
      translations: {
        type: "object",
        additionalProperties: false,
        properties: languageProperties,
        required: Object.keys(requests)
      }
    },
    required: ["translations"]
  };
}

export async function createOpenAITranslationProvider({
  apiKey,
  model
}) {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  if (!model) {
    throw new Error("TRANSLATION_MODEL is missing.");
  }

  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });

  return async function translate({ itemId, source, requests }) {
    let response;

    try {
      response = await client.responses.create({
        model,
        store: false,
        instructions: SYSTEM_INSTRUCTIONS,
        input: JSON.stringify({
          articleId: itemId,
          sourceLanguage: "et",
          targetFields: requests,
          source
        }),
        text: {
          format: {
            type: "json_schema",
            name: "news_translations",
            strict: true,
            schema: buildResponseSchema(source, requests)
          }
        }
      });
    } catch (error) {
      throw new Error(
        `OpenAI translation request failed for "${itemId}": ${error.message}`
      );
    }

    if (typeof response.output_text !== "string" || !response.output_text) {
      throw new Error(
        `OpenAI returned no structured translation for "${itemId}".`
      );
    }

    try {
      return JSON.parse(response.output_text);
    } catch (error) {
      throw new Error(
        `OpenAI returned invalid JSON for "${itemId}": ${error.message}`
      );
    }
  };
}

const mockString = (value, language) => {
  if (/^https?:\/\/\S+$/i.test(value)) {
    return value;
  }

  return `[mock ${language}] ${value}`;
};

export function createMockTranslationProvider() {
  return async function translate({ source, requests }) {
    return {
      translations: Object.fromEntries(
        Object.entries(requests).map(([language, fields]) => [
          language,
          Object.fromEntries(
            fields.map((field) => [
              field,
              Array.isArray(source[field])
                ? source[field].map((value) => mockString(value, language))
                : mockString(source[field], language)
            ])
          )
        ])
      )
    };
  };
}
