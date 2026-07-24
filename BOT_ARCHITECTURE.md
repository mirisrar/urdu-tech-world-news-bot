# Bot Architecture

Yeh document specifically bot ke **execution pipeline** (`index.js`) ko detail mein explain karta hai — kya current implementation hai, aur kya improvements planned hain.

## Current Execution Flow (`index.js`, post Phase 1 + Phase 2 + Phase 3)

```
run()
  │
  ├── 1. collectItems():
  │     ├── collectRssItems(): for each configured source (SOURCES — BBC, Al Jazeera,
  │     │     Dawn, Geo News, ARY News): try parseURL → take top MAX_ITEMS_PER_SOURCE (3);
  │     │     catch → log + continue to next source
  │     ├── collectNewsApiItems(): if NEWS_API_KEY set, fetch NewsAPI.org per configured
  │     │     query (default "technology"); skipped entirely (info log) if key unset
  │     └── cap combined result to MAX_ITEMS_PER_RUN (10) across all sources
  ├── for each { item, sourceName }:
  │     ├── 2. try:
  │     │     ├── Supabase: SELECT url WHERE url = item.link
  │     │     │      └── if exists → skip this item
  │     │     ├── analyzeNews(item.title)
  │     │     │      └── POST to Gemini API with responseSchema (structured JSON,
  │     │     │          Phase 3), retry-with-backoff (up to 2 retries)
  │     │     ├── parse AI response: JSON.parse (Phase 3 — no more regex)
  │     │     ├── validate required fields present → else retry, then skip+log
  │     │     ├── construct image_url from image_prompt (Pollinations.ai)
  │     │     ├── Supabase: INSERT into news table (incl. seo_title — falls back
  │     │     │      gracefully if that column doesn't exist yet, see DATABASE_SCHEMA.md)
  │     │     └── sleep(AI_CALL_SPACING_MS) — throttle before the next AI call
  │     └── catch: log error, continue to next item (no longer aborts whole run)
  └── log run summary (processed / skipped / failed counts, sources count)
```

## Trigger

GitHub Actions workflow `.github/workflows/news.yml`:
- Runs on cron schedule `0 * * * *` (every hour) and on manual `workflow_dispatch`.
- Sets up Node 22, runs `npm install`, then `node index.js`.
- Injects secrets as environment variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GEMINI_API_KEY`.

## Known Issues — Status

Fixed in Phase 1 (see PR `cursor/phase1-stability-fixes-2a5f`):

1. ~~**Duplicate check doesn't stop execution**~~ — ✅ Fixed. Duplicates are now actually skipped.
2. ~~**Single-item processing**~~ — ✅ Fixed. Up to `MAX_ITEMS_PER_RUN` (5) fresh items are processed per run.
3. ~~**No error isolation**~~ — ✅ Fixed. Each item is wrapped in try/catch; failures are logged and the run continues.
4. ~~**Debug logging in production path**~~ — ✅ Fixed. Replaced with a small structured logger (`log(level, message, meta)`).
5. ~~**Regex-based parsing is fragile**~~ — ✅ Fixed (Phase 3). Replaced entirely by Gemini's structured JSON output (`responseSchema`) + `JSON.parse` — see item 8 below.

Also implemented alongside Phase 1 (pre-Phase-2 prep, same PR):

6. **AI provider migrated from Groq to Gemini** (`gemini-3.5-flash-lite`) — see `AI_PIPELINE.md` §"Why Gemini" for the reasoning, including why an earlier Gemini attempt in this project's history was abandoned and what's different this time.

Fixed in Phase 2 (see PR `cursor/phase2-multi-source-2a5f`):

7. ~~**Single source**~~ — ✅ Fixed. 5 sources configured (BBC, Al Jazeera, Dawn, Geo News, ARY News), each fetched independently with per-source failure isolation. Reuters was evaluated and excluded — its public RSS feeds are no longer live (see `PROJECT_ROADMAP.md` Phase 2). NewsAPI.org later added as an optional 6th source (pre-Phase-3, PR #4).

Fixed in Phase 3 (see PR `cursor/phase3-ai-pipeline-2a5f`):

8. ~~**Free-text AI output**~~ — ✅ Fixed. Gemini's native `responseSchema` now constrains the model's output to valid JSON matching an explicit shape; `parseAiResponse()` uses `JSON.parse` instead of regex. Adds `seoTitle` (new field — requires a DB migration, see `DATABASE_SCHEMA.md`). See `AI_PIPELINE.md` for full details and how schema correctness was verified against the live API without a valid key.

## Target Bot Pipeline (Post Phase 4+)

```
run()
  │
  ├── for each configured source (done — Phase 2):
  │     ├── fetch feed
  │     ├── for each item (top N, done — Phase 1):
  │     │     ├── duplicate check → skip if exists (done — Phase 1)
  │     │     ├── try:
  │     │     │     ├── AI Processor call (done — Phase 3, structured JSON output)
  │     │     │     ├── validate response schema (done — Phase 3, content-level validation)
  │     │     │     ├── image pipeline (Phase 5): generate → download → store
  │     │     │     └── insert into DB with status = "processed"
  │     │     └── catch: log error, mark status = "failed", continue to next item
  │     └── (no early return on failure — pipeline continues)
  └── (future, Phase 4/9): separate publisher jobs read status = "processed" rows and publish to each channel
```

## Separation of Concerns (Target)

As the roadmap progresses, `index.js`'s responsibilities should split into distinct modules/jobs:

| Module | Responsibility | Phase |
|---|---|---|
| `collector` | Fetch + normalize RSS items from all configured sources | 1-2 |
| `deduper` | Check/mark duplicates against DB | 1 |
| `aiProcessor` | Call Gemini, validate, return structured content | 3 |
| `imagePipeline` | Generate, download, optimize, store images | 5 |
| `db` | All Supabase read/write logic, centralized | 1 |
| `publishers/facebook`, `publishers/telegram`, etc. | One module per channel, each idempotent | 4 |
| `logger` | Structured logging (replacing ad-hoc `console.log`) | 1, 8 |

See `FOLDER_STRUCTURE.md` for how this maps to actual directories.

## Failure Handling Philosophy

- **Fail-soft per item**: one bad article should never stop the whole run.
- **Fail-loud on validation**: if AI output doesn't match the expected schema, log it clearly (don't silently save empty fields).
- **Idempotent operations**: re-running the bot on the same data should never create duplicates or double-publish (enforced via DB unique constraints + status tracking, not just application-level checks).
