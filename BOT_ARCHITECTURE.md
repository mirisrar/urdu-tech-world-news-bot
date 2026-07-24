# Bot Architecture

Yeh document specifically bot ke **execution pipeline** (`index.js`) ko detail mein explain karta hai — kya current implementation hai, aur kya improvements planned hain.

## Current Execution Flow (`index.js`, post Phase 1 fixes)

```
run()
  │
  ├── 1. parser.parseURL(BBC_RSS_URL)              → feed.items[]
  ├── 2. items = feed.items.slice(0, MAX_ITEMS_PER_RUN)   → top 5 items (was: only items[0])
  ├── for each item:
  │     ├── 3. try:
  │     │     ├── Supabase: SELECT url WHERE url = item.link
  │     │     │      └── if exists → skip this item (fixed: actually skips now)
  │     │     ├── analyzeNews(item.title)
  │     │     │      └── POST to Gemini API, with retry-with-backoff (up to 2 retries)
  │     │     ├── parse AI response (regex, now captures multi-line fields fully)
  │     │     ├── validate required fields present → else retry, then skip+log
  │     │     ├── construct image_url from image_prompt (Pollinations.ai)
  │     │     └── Supabase: INSERT into news table
  │     └── catch: log error, continue to next item (fixed: no longer aborts whole run)
  └── log run summary (processed / skipped / failed counts)
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
5. ~~**Regex-based parsing is fragile**~~ — ✅ Improved. Multi-line fields (`ARTICLE`, `FACEBOOK_POST`) now capture their full content, and a response missing required fields is retried then skipped/logged instead of silently saved with empty strings. (Still free-text/regex based — moving to structured JSON output is tracked separately as Phase 3.)

Also implemented alongside Phase 1 (pre-Phase-2 prep, same PR):

6. **AI provider migrated from Groq to Gemini** (`gemini-3.5-flash-lite`) — see `AI_PIPELINE.md` §"Why Gemini" for the reasoning, including why an earlier Gemini attempt in this project's history was abandoned and what's different this time.

Still open (later phases):

7. **Single source** — the RSS URL is still hardcoded to BBC; no loop over multiple feeds yet — Phase 2.
8. **Free-text AI output** — parsing is more robust now, but still regex-based rather than a strict JSON schema — Phase 3 (Gemini's native JSON mode makes this easier than it would have been with Groq).

## Target Bot Pipeline (Post Phase 2-3)

```
run()
  │
  ├── for each configured source (Phase 2):
  │     ├── fetch feed
  │     ├── for each item (top N, Phase 1):
  │     │     ├── duplicate check → skip if exists (Phase 1 fix)
  │     │     ├── try:
  │     │     │     ├── AI Processor call (Phase 3, structured JSON output)
  │     │     │     ├── validate response schema
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
