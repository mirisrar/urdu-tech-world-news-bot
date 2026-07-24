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

## Current Output Parsing (regex-based)

| Field | Regex | Notes |
|---|---|---|
| `category` | `/CATEGORY:\s*(.*)/i` | Defaults to `"General"` if not matched |
| `urdu_title` | `/URDU_TITLE:\s*(.*)/i` | Defaults to `""` |
| `urdu_summary` | `/URDU_SUMMARY:\s*(.*)/i` | Defaults to `""`; only captures a single line (may truncate multi-sentence summaries) |
| `article` | `/ARTICLE:\s*([\s\S]*?)FACEBOOK_POST:/i` | Captures multi-line content between `ARTICLE:` and `FACEBOOK_POST:` |
| `hashtags` | `/HASHTAGS:\s*(.*)/i` | Defaults to `""` |
| `facebook_post` | `/FACEBOOK_POST:\s*(.*)/i` | **Bug-prone**: only captures a single line, but the prompt asks for a "complete Facebook post" which is likely multi-line/multi-paragraph — this regex will truncate it |
| `image_prompt` | `/IMAGE_PROMPT:\s*(.*)/i` | Defaults to `""` |

## Known Weaknesses (why Phase 3 exists)

1. **Free-text parsing is fragile** — the model isn't guaranteed to follow the exact format every time; any deviation breaks the regex silently (empty string, no error).
2. **Single-line regexes truncate multi-line content** — `facebook_post` and `urdu_summary` are especially at risk since their expected content is multi-sentence/multi-paragraph.
3. **No validation** — there's no check that all required fields were successfully extracted before inserting into the DB.
4. **No SEO title** — currently missing; needed for Phase 6 (website).
5. **No content moderation** — AI output is trusted and published as-is; no profanity/misinformation check.

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
