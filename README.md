# MTÜ Noortealgatuste Tugi website

## Translating a new news article

The public website never calls a translation API. Estonian is the source
language, and generated English and Russian values are saved in
`translations.js` before deployment.

1. Copy `.env.example` to `.env.local`.
2. Put your OpenAI API key in `OPENAI_API_KEY`.
3. Put the model ID you want to use in `TRANSLATION_MODEL`.
4. Add the article metadata to `news-data.js` and its Estonian source object
   to `translations.js` under `news.items.ARTICLE_ID`. Leave missing English
   and Russian article objects or fields empty.
5. Run:

   ```bash
   npm run translate-news -- --id=ARTICLE_ID
   ```

6. Review the generated English and Russian translations.
7. Commit the generated translations, but never commit `.env.local`.

Translate every article that has missing fields:

```bash
npm run translate-news -- --all-missing
```

Replace existing translations for one article explicitly:

```bash
npm run translate-news -- --id=ARTICLE_ID --force
```

Validate the complete flow without an API key or file changes:

```bash
npm run translate-news -- --id=ARTICLE_ID --force --mock --dry-run
```

Before a successful write, the command validates every requested field and
creates a timestamped backup in `admin-local/backups/`. If any API response or
validation step fails, `translations.js` remains unchanged.
