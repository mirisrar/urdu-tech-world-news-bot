# Bot Architecture

Yeh document specifically bot ke **execution pipeline** (`index.js`) ko detail mein explain karta hai — kya current implementation hai, aur kya improvements planned hain.

## Current Execution Flow (`index.js`)

```
run()
  │
  ├── 1. parser.parseURL(BBC_RSS_URL)      → feed.items[]
  ├── 2. item = feed.items[0]               → sirf top headline
  ├── 3. Supabase: SELECT url WHERE url = item.link
  │        └── if exists → log "Already exists" (BUG: return commented out, processing continues anyway)
  ├── 4. analyzeNews(item.title)
  │        └── POST to Groq API → free-text AI response
  ├── 5. Regex parse AI response → category, urdu_title, urdu_summary, article, hashtags, facebook_post, image_prompt
  ├── 6. Construct image_url from image_prompt (Pollinations.ai)
  └── 7. Supabase: INSERT into news table
```

## Trigger

GitHub Actions workflow `.github/workflows/news.yml`:
- Runs on cron schedule `0 * * * *` (every hour) and on manual `workflow_dispatch`.
- Sets up Node 22, runs `npm install`, then `node index.js`.
- Injects secrets as environment variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GROQ_API_KEY`.

## Known Issues (Bot-Level)

1. **Duplicate check doesn't stop execution** — `return;` after detecting an existing URL is commented out (line ~69 in `index.js`), so the item still gets AI-processed and re-inserted.
2. **Single-item processing** — `feed.items[0]` only ever looks at the top story; if it hasn't changed since the last run, the bot repeatedly (attempts to) process the same headline.
3. **Single source** — the RSS URL is hardcoded; no loop over multiple feeds.
4. **No error isolation** — a single failure (e.g., malformed AI response, network error) can affect the whole run since there's no per-item try/catch boundary.
5. **Debug logging in production path** — e.g. `console.log("GROQ KEY LENGTH:", ...)` and full raw JSON dumps of the Groq response.
6. **Regex-based parsing is fragile** — if the AI's free-text response deviates slightly from the expected format, fields silently default to empty strings rather than failing loudly.

## Target Bot Pipeline (Post Phase 1-3)

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
| `aiProcessor` | Call Groq, validate, return structured content | 3 |
| `imagePipeline` | Generate, download, optimize, store images | 5 |
| `db` | All Supabase read/write logic, centralized | 1 |
| `publishers/facebook`, `publishers/telegram`, etc. | One module per channel, each idempotent | 4 |
| `logger` | Structured logging (replacing ad-hoc `console.log`) | 1, 8 |

See `FOLDER_STRUCTURE.md` for how this maps to actual directories.

## Failure Handling Philosophy

- **Fail-soft per item**: one bad article should never stop the whole run.
- **Fail-loud on validation**: if AI output doesn't match the expected schema, log it clearly (don't silently save empty fields).
- **Idempotent operations**: re-running the bot on the same data should never create duplicates or double-publish (enforced via DB unique constraints + status tracking, not just application-level checks).
