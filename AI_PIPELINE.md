# AI Pipeline

Yeh document AI processing step (bot ka "brain", Phase 3 of roadmap) ko cover karta hai — current prompt design, output format, aur planned improvements.

## Model

- **Provider**: Groq
- **Model**: `llama-3.3-70b-versatile`
- **Temperature**: `0.7`
- **Why Groq**: Fast inference (important for frequent/hourly automation), generous free tier, OpenAI-compatible API shape.

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

This can be done via Groq's JSON mode / `response_format: { type: "json_object" }` (if supported by the model) or by instructing the model clearly and parsing with `JSON.parse` inside a try/catch, with a fallback/retry on parse failure.

### 2. Schema Validation

Validate the parsed object against an expected shape (e.g. using `zod`) before it's allowed into the pipeline. If validation fails: retry once, then log and skip the item (don't insert incomplete data).

### 3. Add SEO Title Field

New `seo_title` field, generated alongside other fields, needed for Phase 6 (website SEO-friendly URLs/meta titles).

### 4. Prompt Versioning

Track prompt changes over time (e.g. a `PROMPT_VERSION` constant or a `prompts/` directory with dated versions) so degraded/improved output can be traced back to a specific prompt revision.

### 5. Content Moderation (future, post-MVP)

Add a lightweight check (keyword filter or a second, cheap moderation-focused AI call) before publishing, to catch clearly inappropriate or low-quality output before it reaches the website/social channels.

## Cost & Rate Considerations

- Each processed article = 1 Groq API call. As Phase 2 (multi-source) and Phase 1 (multi-item per run) land, call volume will increase — monitor free-tier limits and add throttling/backoff (see `PROJECT_ROADMAP.md` Phase 2).
- Batch multiple headlines into fewer calls where feasible (e.g. one call analyzing N headlines) as a future cost optimization — not required for MVP correctness.
