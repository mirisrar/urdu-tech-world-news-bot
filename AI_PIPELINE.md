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
4. **Structured output support**: Gemini's `generationConfig.responseMimeType: "application/json"` (with an optional `responseSchema`) gives a native path to Phase 3's "move to structured JSON output" goal, without needing a separate library. This isn't used yet (the current migration deliberately kept the existing free-text prompt/regex-parsing pipeline unchanged, to isolate the provider swap from other changes) but it's a natural next step when Phase 3 starts.

### ⚠️ Important context: this project tried Gemini before

Git history (`d66f19e`, `17e4d00`, `ddcf0c3`, and the "Update index.js" commits around them) shows this project **already used Gemini earlier** (`gemini-2.5-flash-lite` → `gemini-2.5-flash` → `gemini-2.0-flash`, including a commit that queried the `/v1beta/models` list endpoint to debug which model names were actually available), before switching to Groq. This suggests the earlier attempt hit **model-availability/naming churn** issues — Gemini model IDs have changed multiple times, and picking a model your API key/quota doesn't actually have access to fails at request time with a 404, not at development time.

**What's different this time**:
- The model ID (`gemini-3.5-flash-lite`) is Google's current (mid-2026) stable, generally-available model — not a preview/experimental one — reducing the chance it's renamed or retired soon.
- `callGemini()` now surfaces API errors clearly (status code + response body) via structured logging, and `analyzeNews()` retries with backoff — so if a model ID does become invalid again, it will fail loudly and visibly in the GitHub Actions logs instead of silently, and won't take down the whole run (Phase 1 fix).
- If Google renames/deprecates this model again, only the `GEMINI_MODEL` constant in `index.js` needs to change (see `AI_PIPELINE.md` §"Model" and `index.js`) — check `https://ai.google.dev/gemini-api/docs/models` for the current model list before assuming a name is still valid.

### Verifying Output Quality (recommended before fully trusting Gemini here)

Since this is a genuine provider switch (not just a config tweak), a few Gemini-processed articles should be manually spot-checked against what Groq previously produced for the same headlines — specifically Urdu translation accuracy/fluency and whether the model reliably follows the `CATEGORY:`/`URDU_TITLE:`/etc. label format. If Gemini deviates from the expected format more often than Groq did, that's a signal to either adjust the prompt or move up the priority of Phase 3's structured-JSON-output work.

## Current Prompt (as implemented in `index.js`)

```
Analyze this news headline and return EXACTLY in this format:

CATEGORY: Technology
URDU_TITLE: Urdu headline
URDU_SUMMARY: Two sentence Urdu summary
ARTICLE: 300 word detailed Urdu article
HASHTAGS: #News #Technology
FACEBOOK_POST: Complete Facebook post in Urdu
IMAGE_PROMPT: Professional AI image prompt

Headline:
<headline text>
```

## Current Output Parsing (regex-based, post Phase 1 fix)

A generic `extractField(text, label, allLabels)` helper now captures each field's content up to the *next* known label (or end of string), instead of using a single-line `(.*)` regex per field. This fixes the previous truncation bug for multi-line fields.

| Field | Notes |
|---|---|
| `category` | Defaults to `"General"` if not matched |
| `urdu_title` | Defaults to `""` — required for a response to be considered valid |
| `urdu_summary` | Defaults to `""` — required for a response to be considered valid; now captures full multi-sentence content |
| `article` | Captures full multi-line content up to `HASHTAGS:`/`FACEBOOK_POST:`/etc.; required for a response to be considered valid |
| `hashtags` | Defaults to `""` |
| `facebook_post` | **Fixed**: previously only captured a single line even though the prompt asks for a "complete Facebook post" (multi-line/multi-paragraph); now captures full content up to the next label |
| `image_prompt` | Defaults to `""` |

A response is only accepted if `urdu_title`, `urdu_summary`, and `article` were all successfully extracted (`isValidAiResult`); otherwise the call is retried (up to 2 times with backoff), and if still invalid, the item is skipped and logged rather than saved with empty fields.

## Known Weaknesses (why Phase 3 still exists)

1. **Still free-text, not structured JSON** — the model isn't guaranteed to follow the exact format every time. The Phase 1 fix makes failures *safe* (retried, then skipped+logged) rather than *silent*, but doesn't eliminate the underlying fragility of regex-based parsing.
2. **No SEO title** — currently missing; needed for Phase 6 (website).
3. **No content moderation** — AI output is trusted and published as-is; no profanity/misinformation check.
4. **No prompt versioning yet** — the prompt itself isn't tracked/versioned across changes.

## Planned Improvements (Phase 3)

### 1. Move to Structured JSON Output

Instead of free-text with labeled fields, request (and validate) a JSON object directly, e.g.:

```json
{
  "category": "Technology",
  "urdu_title": "...",
  "urdu_summary": "...",
  "seo_title": "...",
  "article": "...",
  "hashtags": ["#News", "#Technology"],
  "facebook_post": "...",
  "image_prompt": "..."
}
```

This can be done via Gemini's native JSON mode (`generationConfig: { responseMimeType: "application/json", responseSchema: {...} }`) or by instructing the model clearly and parsing with `JSON.parse` inside a try/catch, with a fallback/retry on parse failure.

### 2. Schema Validation

Validate the parsed object against an expected shape (e.g. using `zod`) before it's allowed into the pipeline. If validation fails: retry once, then log and skip the item (don't insert incomplete data).

### 3. Add SEO Title Field

New `seo_title` field, generated alongside other fields, needed for Phase 6 (website SEO-friendly URLs/meta titles).

### 4. Prompt Versioning

Track prompt changes over time (e.g. a `PROMPT_VERSION` constant or a `prompts/` directory with dated versions) so degraded/improved output can be traced back to a specific prompt revision.

### 5. Content Moderation (future, post-MVP)

Add a lightweight check (keyword filter or a second, cheap moderation-focused AI call) before publishing, to catch clearly inappropriate or low-quality output before it reaches the website/social channels.

## Cost & Rate Considerations

- Each processed article = 1 Gemini API call. As Phase 2 (multi-source) and Phase 1 (multi-item per run) land, call volume will increase — monitor Gemini's rate limits/quota (Google AI Studio free tier has per-minute/per-day request caps) and add throttling/backoff (see `PROJECT_ROADMAP.md` Phase 2).
- Batch multiple headlines into fewer calls where feasible (e.g. one call analyzing N headlines) as a future cost optimization — not required for MVP correctness.
