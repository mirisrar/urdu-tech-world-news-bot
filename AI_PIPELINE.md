# AI Pipeline

Yeh document AI processing step (bot ka "brain", Phase 3 of roadmap) ko cover karta hai — current prompt design, output format, aur planned improvements.

## Model

- **Provider**: Google Gemini
- **Model**: `gemini-3.5-flash-lite`
- **Sampling**: default (no `temperature`/`top_p`/`top_k` override — see "Why Gemini" below)
- **Auth**: `x-goog-api-key` header with `GEMINI_API_KEY`

### Why Gemini (and not Groq)?

The bot originally used Groq (`llama-3.3-70b-versatile`) for fast, low-cost inference. It has since been migrated to Gemini for a few concrete reasons:

1. **Model fit for the exact task**: Google explicitly recommends `gemini-3.5-flash-lite` for *"high-volume data analysis, document extraction, and structured JSON parsing"* — which is almost a literal description of what this bot does (translate + classify + summarize many headlines per run, and Phase 3 wants strict JSON output). It's the fastest/cheapest model in Google's current lineup, which fits an hourly, multi-item cron job well (see `PROJECT_ROADMAP.md` Phase 2/9 on cost/throughput considerations).
2. **Multilingual/Urdu quality**: Gemini's training and evaluation explicitly cover a very broad set of languages including Urdu, which matters directly for translation and summary quality — the core value this bot delivers. This is a qualitative reason, worth validating empirically (see "Verifying Output Quality" below) rather than assuming.
3. **One vendor for text *and* future image generation**: Google's Gemini/Imagen family can also generate images. Phase 5 (`DATABASE_SCHEMA.md`/`PROJECT_ROADMAP.md`) needs a permanent, reliable image pipeline — today it depends on an unauthenticated third-party service (Pollinations.ai) with no uptime guarantee. Consolidating AI text + image generation under one Google API key/billing account is a plausible future simplification (not implemented yet — still tracked as Phase 5), whereas Groq is text-only.
4. **Structured output support**: Gemini's `generationConfig.responseMimeType: "application/json"` + `responseSchema` gives a native path to structured JSON output without needing a separate library. **This is now implemented (Phase 3, PR #5)** — see "Current Prompt & Output Format" below.

### ⚠️ Important context: this project tried Gemini before

Git history (`d66f19e`, `17e4d00`, `ddcf0c3`, and the "Update index.js" commits around them) shows this project **already used Gemini earlier** (`gemini-2.5-flash-lite` → `gemini-2.5-flash` → `gemini-2.0-flash`, including a commit that queried the `/v1beta/models` list endpoint to debug which model names were actually available), before switching to Groq. This suggests the earlier attempt hit **model-availability/naming churn** issues — Gemini model IDs have changed multiple times, and picking a model your API key/quota doesn't actually have access to fails at request time with a 404, not at development time.

**What's different this time**:
- The model ID (`gemini-3.5-flash-lite`) is Google's current (mid-2026) stable, generally-available model — not a preview/experimental one — reducing the chance it's renamed or retired soon.
- `callGemini()` now surfaces API errors clearly (status code + response body) via structured logging, and `analyzeNews()` retries with backoff — so if a model ID does become invalid again, it will fail loudly and visibly in the GitHub Actions logs instead of silently, and won't take down the whole run (Phase 1 fix).
- If Google renames/deprecates this model again, only the `GEMINI_MODEL` constant in `index.js` needs to change (see `AI_PIPELINE.md` §"Model" and `index.js`) — check `https://ai.google.dev/gemini-api/docs/models` for the current model list before assuming a name is still valid.

### Verifying Output Quality (recommended before fully trusting Gemini here)

Since this is a genuine provider switch (not just a config tweak), a few Gemini-processed articles should be manually spot-checked against what Groq previously produced for the same headlines — specifically Urdu translation accuracy/fluency and whether the model reliably follows the `CATEGORY:`/`URDU_TITLE:`/etc. label format. If Gemini deviates from the expected format more often than Groq did, that's a signal to either adjust the prompt or move up the priority of Phase 3's structured-JSON-output work.

## Current Prompt & Output Format (`ai_agent.js`, `PROMPT_VERSION = 4`)

Logic lives in **`ai_agent.js`**. Source text comes from **`fetcher.js`**.

**System instruction (strict):**
- `title_urdu`, `body_urdu`, `urdu_summary`, `seo_title`, `facebook_post` → Arabic-script Urdu only
- `body_urdu` → full article, **3–4 paragraphs** (~300–450 words), never a teaser
- **No AI image fields** — Pollinations / `image_prompt` generation is disabled

**Schema keys:** `title_urdu`, `body_urdu` (+ category/summary/seo/hashtags/facebook). Mapped to DB `urdu_title` / `article`.

**Images:** `fetcher.resolveArticleImage()` uses RSS `media:content` / `enclosure` / inline `<img>`, then page `og:image` / `twitter:image`. Placeholder only if none found. `imagePipeline.js` may re-host that original URL in Supabase Storage.

```js
generationConfig: {
  responseMimeType: "application/json",
  responseSchema: RESPONSE_SCHEMA,  // ai_agent.js — text only
  maxOutputTokens: 4096
}
```

### Validation (`isValidAiResult`)

Requires Arabic-script Urdu in title/summary/body and `body_urdu` length ≥ ~450 chars. Retries with backoff; still-invalid items are skipped.

### ⚠️ `seoTitle` requires a DB migration

`seoTitle` is a genuinely new field. `saveNews()` tries to insert it as `seo_title`, but **gracefully falls back** (retries without it, logs a warning) if the Supabase table doesn't have that column yet — see `DATABASE_SCHEMA.md` for the required `ALTER TABLE` statement. This was a deliberate defensive choice since this change can't run database migrations itself (no DB credentials in the dev environment).

### How this was verified without a real API key

No real `GEMINI_API_KEY` was available in the development environment, so the *content* of a real structured response couldn't be checked. What *was* verified against the live Gemini API (using an intentionally invalid key):
- A correctly-formed `RESPONSE_SCHEMA` request only fails with `API_KEY_INVALID` — meaning Gemini accepted the schema itself as structurally valid.
- An intentionally broken schema (invalid `type` value) is rejected by Gemini with a schema-specific validation error (`generation_config.response_schema.type`) — different from the key-only error above, confirming Gemini really does validate schema shape and that our schema passes.

**Recommended before fully trusting this in production**: run the bot once with a real `GEMINI_API_KEY` (and the `seo_title` migration applied) and manually inspect a few saved rows — specifically Urdu translation quality/fluency and whether `seoTitle` looks meaningfully different from `urduTitle` (it should be a distinct, search-optimized phrasing, not a duplicate).

## Remaining Weaknesses (post Phase 3)

1. **No content moderation** — AI output is trusted and published as-is; no profanity/misinformation check. (Still future work — see below.)
2. **No schema validation library** (e.g. `zod`) — validation is manual/inline (`typeof` checks) rather than a declarative schema-validation library. This was a deliberate choice to avoid adding a dependency when Gemini's own `responseSchema` already does most of the structural enforcement; revisit if validation logic grows more complex.
3. **Prompt versioning is a single constant, not a full history system** — `PROMPT_VERSION` + a comment block tracks major revisions, but there's no automated way to correlate a specific saved article with the exact prompt version that produced it (e.g. a `prompt_version` DB column). Consider adding one if prompt iteration becomes frequent.

### Content Moderation (future, post-MVP)

Add a lightweight check (keyword filter or a second, cheap moderation-focused AI call) before publishing, to catch clearly inappropriate or low-quality output before it reaches the website/social channels.

## Cost & Rate Considerations

- Each processed article = 1 Gemini API call. As Phase 2 (multi-source) and Phase 1 (multi-item per run) land, call volume will increase — monitor Gemini's rate limits/quota (Google AI Studio free tier has per-minute/per-day request caps) and add throttling/backoff (see `PROJECT_ROADMAP.md` Phase 2).
- Batch multiple headlines into fewer calls where feasible (e.g. one call analyzing N headlines) as a future cost optimization — not required for MVP correctness.
