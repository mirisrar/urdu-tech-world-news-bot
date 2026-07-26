# Bot Architecture

Yeh document specifically bot ke **execution pipeline** (`index.js`) ko detail mein explain karta hai — kya current implementation hai, aur kya improvements planned hain.

## Current Execution Flow (`index.js`, post Phase 1 + Phase 2 + Phase 3 + Phase 4 + Phase 5 + Phase 6)

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
  │     │     ├── getArticleImageUrl() (Phase 5): download image_prompt's image from
  │     │     │      Pollinations.ai → optimize with sharp (1200x630, WebP) → upload
  │     │     │      to Supabase Storage → return the permanent public URL, falling
  │     │     │      back gracefully at each stage (never throws)
  │     │     ├── saveNews(): Supabase INSERT into news table (incl. seo_title —
  │     │     │      falls back gracefully via writeWithColumnFallback() if
  │     │     │      that column doesn't exist yet, see DATABASE_SCHEMA.md);
  │     │     │      returns the new row's id
  │     │     ├── publishAndRecord() (Phase 4):
  │     │     │      ├── publishAll(): try each configured channel (Facebook,
  │     │     │      │     Telegram, X, WhatsApp) independently — skip if not
  │     │     │      │     configured, catch+report if it fails, never throw
  │     │     │      └── updatePublishStatus(): record post IDs on the row
  │     │     │            (same graceful column-fallback), never throws —
  │     │     │            a publish/status-tracking hiccup never undoes the save
  │     │     └── sleep(AI_CALL_SPACING_MS) — throttle before the next AI call
  │     └── catch: log error, continue to next item (no longer aborts whole run)
  └── log run summary (processed / skipped / failed counts, sources count)
```

**Note on timing**: Pollinations.ai image generation is not instant (~10-20 seconds observed in testing) — combined with the Gemini call and `AI_CALL_SPACING_MS` throttling, per-item processing time increased meaningfully in this phase. Still comfortably within the hourly cron window at current volume (`MAX_ITEMS_PER_RUN` = 10), but worth revisiting if `MAX_ITEMS_PER_RUN`/source count grows a lot further (see Phase 9 — parallelizing image processing is one option).

## Trigger

GitHub Actions workflow `.github/workflows/news.yml`:
- Runs on cron schedule `0 * * * *` (every hour) and on manual `workflow_dispatch`.
- Sets up Node 22, runs `npm install`, then `node index.js`.
- Injects secrets as environment variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GEMINI_API_KEY`, plus whichever optional source/channel/storage secrets are configured (`NEWS_API_KEY`, `FACEBOOK_*`, `TELEGRAM_*`, `X_*`, `WHATSAPP_*`, `SUPABASE_STORAGE_BUCKET`, `DEFAULT_FALLBACK_IMAGE_URL` — see `API_DOCUMENTATION.md` §4).

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

Implemented in Phase 4 (see PR `cursor/phase4-social-publishing-2a5f`):

9. **Social publishing** — `publishers/` module (Facebook, Telegram, X, WhatsApp), wired in via `publishAndRecord()` right after a successful save. Each channel is optional (skipped if unconfigured) and fail-soft (a channel's failure never affects the saved article or the other channels). See `PROJECT_ROADMAP.md` Phase 4 for the WhatsApp scope adjustment.
10. **Generalized column-fallback** — the Phase 3 `seo_title`-only workaround was generalized into `writeWithColumnFallback()`, reused for both `saveNews()` and the new publish-status update, so any combination of missing optional columns degrades gracefully.

Implemented in Phase 5 (see PR `cursor/phase5-image-pipeline-2a5f`):

11. **Image pipeline** — `imagePipeline.js` (`getArticleImageUrl()`) downloads, optimizes (`sharp`), and permanently stores (Supabase Storage) the AI-generated image, replacing the on-the-fly Pollinations.ai URL with a stable one. 4-level graceful fallback if any stage fails; never throws.

Implemented in Phase 6 (see PR `cursor/website-integration-2a5f`):

12. **Website integration** — `website-integration/` (copied into the separate Nexora News Urdu repo) reads `news` directly from Supabase; no bot-side push code needed.
13. **⚠️ Security fix — write credential**: since the website now uses `SUPABASE_ANON_KEY` publicly (client-side), RLS must restrict `anon` to read-only, which means the bot itself can no longer write with that key. `index.js` now prefers `SUPABASE_SERVICE_ROLE_KEY` for its own Supabase client (bypasses RLS, server-side only), falling back to `SUPABASE_ANON_KEY` with a loud warning for anyone who hasn't migrated. See `SECURITY_GUIDELINES.md`/`DATABASE_SCHEMA.md` for the required setup order.

## Target Bot Pipeline (Post Phase 6+)

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
  │     │     │     ├── image pipeline (done — Phase 5): download → optimize → store
  │     │     │     ├── insert into DB with status = "processed"
  │     │     │     └── publish to configured channels (done — Phase 4, currently inline;
  │     │     │           moving to a separate job reading status = "processed" rows is a
  │     │     │           Phase 9 consideration once a `status` column exists and volume
  │     │     │           justifies decoupling collect/process from publish)
  │     │     └── catch: log error, mark status = "failed", continue to next item
  │     └── (no early return on failure — pipeline continues)
  └── (future, Phase 6): website reads processed rows from the same Database
```

## Separation of Concerns (Target)

As the roadmap progresses, `index.js`'s responsibilities should split into distinct modules/jobs:

| Module | Responsibility | Phase | Status |
|---|---|---|---|
| `collector` | Fetch + normalize items from all configured sources | 1-2 | Logic exists (`collectRssItems`/`collectNewsApiItems` functions) but still lives in `index.js`, not yet extracted to its own file |
| `deduper` | Check/mark duplicates against DB | 1 | Same — `isDuplicate()` in `index.js` |
| `aiProcessor` | Call Gemini, validate, return structured content | 3 | Same — `analyzeNews()`/`parseAiResponse()` in `index.js` |
| `imagePipeline` | Download, optimize, store images | 5 | ✅ **Done** — actually extracted into `imagePipeline.js` at repo root |
| `db` | All Supabase read/write logic, centralized | 1 | Partially — `writeWithColumnFallback()` centralizes the fallback logic, but calls are still spread across `index.js` |
| `publishers/facebook`, `publishers/telegram`, `publishers/x`, `publishers/whatsapp` | One module per channel, each idempotent | 4 | ✅ **Done** — actually extracted into `publishers/` (this phase's implementation started the modularization) |
| `logger` | Structured logging (replacing ad-hoc `console.log`) | 1, 8 | Minimal version exists (`log()` in `index.js`) but not extracted to its own module |

See `FOLDER_STRUCTURE.md` for how this maps to actual directories.

## Failure Handling Philosophy

- **Fail-soft per item**: one bad article should never stop the whole run.
- **Fail-loud on validation**: if AI output doesn't match the expected schema, log it clearly (don't silently save empty fields).
- **Idempotent operations**: re-running the bot on the same data should never create duplicates or double-publish (enforced via DB unique constraints + status tracking, not just application-level checks).
