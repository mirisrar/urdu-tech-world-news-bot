# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). Versions abhi formally tag nahi ki gayi hain (project pre-v1, continuous deployment via `main`) — entries chronological hain, git history ke mutabiq.

## [Unreleased]

### Added
- Full project documentation suite: `PROJECT_OVERVIEW.md`, `PROJECT_ROADMAP.md`, `PROJECT_RULES.md`, `TECH_STACK.md`, `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `API_DOCUMENTATION.md`, `BOT_ARCHITECTURE.md`, `AI_PIPELINE.md`, `FOLDER_STRUCTURE.md`, `UI_UX_GUIDELINES.md`, `CODING_STANDARDS.md`, `DEVELOPMENT_WORKFLOW.md`, `DEPLOYMENT_GUIDE.md`, `TESTING_GUIDE.md`, `SECURITY_GUIDELINES.md`, `CONTRIBUTING.md`.
- 9-phase project roadmap (Stability → Multi-Source → AI Pipeline → Publishing → Images → Website → Dashboard → Monitoring → Scale), with a weighted completion-percentage tracker.
- Structured logger, retry-with-backoff for AI calls, and per-item run summary logging in `index.js`.

### Changed
- **AI provider migrated from Groq (`llama-3.3-70b-versatile`) to Gemini (`gemini-3.5-flash-lite`)**. Auth changed from `Authorization: Bearer <GROQ_API_KEY>` to `x-goog-api-key: <GEMINI_API_KEY>`. See `AI_PIPELINE.md` §"Why Gemini" for the reasoning and important context (this project used Gemini before, moved to Groq, and has now moved back — see History below).
- `.github/workflows/news.yml` secret requirement: `GROQ_API_KEY` → `GEMINI_API_KEY` (repo secret must be updated by a maintainer — not something this change can do on its own).

### Added (Phase 2 — Multi-Source News Collection)
- Config-driven `SOURCES` list replacing the single hardcoded BBC feed: BBC, Al Jazeera, Dawn, Geo News, ARY News (all live-tested with the actual `rss-parser` library before being added).
- `collectItems()` fetches each source independently — a failure on one source (network error, invalid feed) is logged and skipped without blocking the others.
- `MAX_ITEMS_PER_SOURCE`/`MAX_ITEMS_PER_RUN` caps and `AI_CALL_SPACING_MS` throttling, so AI-call volume stays bounded as more sources are added.
- `source` DB column now reflects the actual originating feed per article instead of a hardcoded `"BBC"`.
- Added `.gitignore` and `package-lock.json` to the code branch (previously only present on the docs branch).

### Changed (Phase 2)
- **Reuters excluded** from the source list: their public RSS feeds were discontinued around 2020; candidate feed URLs were verified via `curl` to return a 404 or a marketing page rather than valid RSS.

### Added (pre-Phase-3 — NewsAPI.org source)
- New `newsapi.js` module: `fetchNewsFromNewsApi(query, options)` — a standalone client for NewsAPI.org's `/v2/everything` and `/v2/top-headlines` endpoints. Reads `NEWS_API_KEY` from the environment (never hardcoded), returns a clean `{title, description, url, urlToImage}` array, and distinguishes network errors from NewsAPI's own error responses.
- `index.js`: NewsAPI wired in as a 6th, optional collector source (`collectNewsApiItems()`), skipped automatically (info log, not an error) if `NEWS_API_KEY` isn't set.
- Tested: missing key, invalid query, invalid key against the real NewsAPI (live), simulated network failure, and mocked success-path mapping all verified. **Not tested**: success path against real NewsAPI data — no real `NEWS_API_KEY` was available in the development environment.

### Added (Phase 3 — AI Processing Pipeline)
- Gemini's native structured output (`responseMimeType: "application/json"` + `responseSchema`) replaces the old free-text `LABEL: value` prompt/regex-parsing pipeline entirely.
- New `seoTitle` field, generated alongside the existing fields — needed for Phase 6 (website). **Requires a DB migration** (`ALTER TABLE news ADD COLUMN IF NOT EXISTS seo_title text;`, see `DATABASE_SCHEMA.md`); `saveNews()` degrades gracefully (retries without `seo_title`, logs a warning) if the column isn't present yet.
- `PROMPT_VERSION` constant (now `2`) with a version-history comment.
- Verified schema correctness against the real Gemini API (live requests with an invalid key): a correctly-typed schema only fails on the API key, while an intentionally broken schema is rejected with a schema-specific validation error — confirms structural correctness even though the full success path (real key → real structured response) wasn't live-tested.

### Fixed (Phase 1 — Stability & Bug Fixes)
- Duplicate news items are now actually skipped (previously detected but the skip `return` was commented out).
- Bot now processes up to 5 fresh RSS items per run instead of only `feed.items[0]`.
- A single item's failure (AI error, malformed response, DB error) no longer aborts the whole run — errors are isolated per item.
- AI responses are now validated (required fields must be present) before saving; invalid/incomplete responses are retried, then skipped and logged instead of being saved with empty fields.
- Fixed regex field extraction so multi-line fields (`ARTICLE`, `FACEBOOK_POST`) capture their full content instead of truncating to a single line.
- Removed debug logging that dumped the AI API key length and full raw API responses to the console.

### Known Issues (remaining, tracked in `PROJECT_ROADMAP.md`)
- Single hardcoded RSS source (BBC) — Phase 2.
- AI output is still free-text/regex-parsed rather than structured JSON — Phase 3 (Gemini's native JSON mode should make this easier than it would have been with Groq).
- Generated images are not permanently stored (on-the-fly URL only) — Phase 5.
- No automated tests — see `TESTING_GUIDE.md`.

## History (from git log, summarized)

- **2026-07 (early)**: Initial bot implementation using Gemini (`gemini-2.5-flash-lite`, later `gemini-2.5-flash`/`gemini-2.0-flash`) for Urdu translation, BBC RSS fetch, Supabase storage, GitHub Actions hourly cron.
- **2026-07**: Switched from Gemini to Groq (`llama-3.3-70b-versatile`) — likely due to model-availability/naming issues encountered with the Gemini model IDs used at the time (git history shows debugging via the `/v1beta/models` list endpoint before the switch). Continued iterative fixes to `index.js` and `news.yml` (response parsing adjustments, workflow tuning — 37 commits total prior to this documentation pass).
- **2026-07 (this pass)**: Migrated back from Groq to Gemini (`gemini-3.5-flash-lite`), this time using a current stable/GA model ID and with Phase 1's retry/error-isolation/logging fixes already in place to surface any future provider issues loudly instead of silently.

> Note: Since prior commits used generic messages (e.g. "Update index.js") without a changelog discipline, this history section is a best-effort summary. Going forward, follow `PROJECT_RULES.md` (Conventional Commits) and update this file with each meaningful change so future entries are precise.

## How to Add Entries Going Forward

Under `[Unreleased]`, add entries as you work, categorized as:
- `Added` — new features
- `Changed` — changes to existing functionality
- `Fixed` — bug fixes
- `Removed` — removed features
- `Security` — security-related fixes

When a meaningful milestone is reached (e.g. "Phase 1 complete"), consider cutting a version (e.g. `v0.1.0`) and moving `[Unreleased]` entries under a dated version heading.
