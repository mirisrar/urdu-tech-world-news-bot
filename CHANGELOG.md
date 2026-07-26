# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). Versions abhi formally tag nahi ki gayi hain (project pre-v1, continuous deployment via `main`) — entries chronological hain, git history ke mutabiq.

## [Unreleased]

### Changed (original article images — AI images disabled)
- Disabled Pollinations / AI `image_prompt` generation in `ai_agent.js` (prompt v4).
- `fetcher.js` now extracts real images from RSS (`media:content`, `media:thumbnail`, `enclosure`, inline `<img>`) and from the article page (`og:image`, `twitter:image`).
- `imagePipeline.js` only re-hosts the original URL (optional Storage upload); placeholder used only when no original image exists.

### Changed (faster posting cadence)
- GitHub Actions cron: hourly → **every 10 minutes** (`*/10 * * * *`), with concurrency lock so runs don’t overlap.
- Higher defaults: `MAX_ITEMS_PER_SOURCE=25`, `MAX_ITEMS_PER_RUN=40` (env-tunable).
- Collector now **dedupes first**, then processes every *new* story up to the cap (so the run isn’t wasted on already-saved BBC items).

### Fixed (local Pakistan coverage)
- Added Google News Pakistan RSS first in `SOURCES`: `hl=en-PK&gl=PK&ceid=PK:en` and Urdu `hl=ur&gl=PK&ceid=PK:ur` (verified live; geo/PK section feed is unavailable).
- Parse Google “Headline - Publisher” titles so DB `source` stores the real outlet (Dawn, Radio Pakistan, etc.).

### Fixed (Urdu content quality + unique images)
- New `fetcher.js`: extracts richest RSS/NewsAPI source text (`content:encoded` → content → summary/description) so the AI is not headline-only.
- New `ai_agent.js` (prompt v3): strict Urdu system instruction, schema keys `title_urdu` / `body_urdu` / `image_prompt`, min-length + Arabic-script validation, rejects English/short bodies.
- Topic-specific `image_prompt` required; generic prompts auto-replaced with a per-article detailed prompt (never a hardcoded static prompt).
- `imagePipeline.js`: unique Pollinations `seed` per article; no shared static image-prompt fallback.

### Added (Phase 8 — Monitoring & Analytics)
- Confirmed existing **Nexora CMS Analytics** (`analytics.html` / `analytics.js`) — views, charts, category breakdown, publishing report, CSV export — no rebuild in this bot repo.
- New `monitoring/runAlert.js`: end-of-run Telegram health alert (processed/skipped/failed/duration + error snippets). Wired into `index.js` after every run and on fatal failure. Fail-soft; optional `TELEGRAM_ALERT_CHAT_ID` + `TELEGRAM_ALERT_MODE` (`always`|`failures`|`off`).
- Workflow + `.env.example` updated for the new alert env vars.

### Added (Phase 7 — Admin Dashboard / shared schema + RLS)
- Confirmed existing **Nexora CMS Admin** on the website (dashboard / news list / add-edit form) already covers news add, edit, save, and delete against the shared Supabase `news` table — no new Admin UI built in this bot repo.
- `website-integration/database/schema-align.sql`: Admin columns (`views`, `featured`, `reading_time`), bot/publish columns, nullable `source`/`url` for manual posts, partial unique index on `url`.
- Updated `website-integration/database/rls-policy.sql`: `anon` SELECT-only; `authenticated` full CRUD on `news`; Storage policies for `news-images` (public read, authenticated upload). Bot continues to use `service_role` (RLS bypass).
- Docs: Phase 7 marked ✅ Done; `DATABASE_SCHEMA.md` / `SECURITY_GUIDELINES.md` describe Bot + Admin + Public three-role access model.

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

### Added (Phase 4 — Social Media Publishing Layer)
- New `publishers/` module: `facebook.js`, `telegram.js`, `x.js`, `whatsapp.js`, and an `index.js` orchestrator (`publishAll()`). Wired into `index.js` — every successfully saved article is now automatically published to whichever channels are configured.
- Facebook Graph API (Page feed/photos), Telegram Bot API (sendMessage/sendPhoto), X API v2 (OAuth 1.0a signed via `node:crypto`, no new dependency), WhatsApp Business Cloud API (template messages to opted-in recipients).
- **Important scope finding**: WhatsApp Channels (the public, Telegram-channel-like broadcast feature) have no official public API as of 2026 — only unofficial, ToS-risking reverse-engineered gateways claim to support that, and this project deliberately does not use them. What's implemented instead is the officially supported alternative: private template broadcasts to opted-in numbers.
- Generalized the Phase 3 `seo_title`-only column-fallback into `writeWithColumnFallback()`, now reused for both the insert and the new publish-status update (`fb_post_id`, `telegram_message_id`, `whatsapp_status`, `x_post_id`, `published_at`).
- Each publisher independently optional (skipped if unconfigured) and fail-soft (a channel's failure never affects the saved article or other channels).
- Verified request format against the real platform APIs using fake-but-well-formed credentials: Facebook/WhatsApp return real "Invalid OAuth access token" errors, Telegram returns real 401 Unauthorized, and X's manually OAuth1.0a-signed request reaches Twitter's server and gets a proper 401 (not a malformed-request rejection) — confirming the signing implementation is structurally correct. Actual publish success was not tested (no real platform credentials available).
- **Also fixed**: `.github/workflows/news.yml` was missing the `env:` entries for `NEWS_API_KEY` and all Phase 4 publisher secrets — meaning even if those GitHub Actions secrets were added, they'd never reach `node index.js` in production. Fixed across the NewsAPI and Phase 4 branches.

### Added (Phase 6 — Website Integration)
- New `website-integration/` folder: modular, production-ready vanilla JS (ES6+, no build step) for Nexora News Urdu (HTML5/CSS3/Vanilla JS, Vercel-hosted, no framework) to read `news` directly from Supabase. No webhook needed — the website is the entire integration surface, meant to be copied into its own separate repo.
- `newsApi.js`: `getHeroNews`, `getBreakingNews`, `getLatestNews` (paginated + category filter), `getNewsByCategory`, `getTrendingNews`, `getCategories`, `searchNews`, `getArticleById`.
- `realtime.js`: `subscribeToNewArticles()` for live updates via Supabase Realtime, no page refresh needed.
- `utils.js`: presentation helpers (relative time incl. Urdu locale, image fallback, excerpt, article URL).
- `database/rls-policy.sql`: the required Row Level Security policy (public SELECT, no write) needed to safely expose the anon key client-side.
- `examples/`: full working homepage and article page reference markup.
- Verified every `newsApi.js` function's actual generated PostgREST query by intercepting `fetch()` calls made by the real `@supabase/supabase-js` package. Not live-tested against a real Supabase project (none was available in the dev environment).

### Security (Phase 6 — critical)
- **Bot write credential changed**: since the website now exposes `SUPABASE_ANON_KEY` publicly (client-side) and RLS must therefore restrict `anon` to read-only, the bot can no longer write with that key. `index.js` now prefers `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS, server-side only) for its own Supabase client, falling back to `SUPABASE_ANON_KEY` with a loud warning for anyone who hasn't migrated yet.
- Wired `SUPABASE_SERVICE_ROLE_KEY` into `.github/workflows/news.yml`'s `env:` block.

### Resolved (Phase 6 scope clarification)
- Confirmed: "Nexora News Urdu" is an **existing, already-built website**, not something to build from scratch. Phase 6 scope is now integration-only (connect the existing site to this bot's Supabase data), not a new frontend build. Still needed to implement: the website's tech stack, where its code lives, and whether a direct-Supabase-read or webhook-push integration is appropriate — see `PROJECT_ROADMAP.md` Phase 6.

### Added (Phase 5 — Image Pipeline)
- New `imagePipeline.js` (`getArticleImageUrl()`): downloads the AI-generated image from Pollinations.ai, optimizes it with `sharp` (resized/cropped to 1200x630, re-encoded as WebP quality 80), and uploads it to Supabase Storage (`SUPABASE_STORAGE_BUCKET`, default `news-images`), returning the permanent public URL.
- 4-level graceful fallback: permanent Storage URL → raw Pollinations.ai URL (pre-Phase-5 behavior) → `DEFAULT_FALLBACK_IMAGE_URL` (if configured) → empty string. Never throws — a bad image never blocks saving or publishing an article.
- New `sharp` dependency (image processing).
- Verified live against the real Pollinations.ai API (download + optimize) and against a real-but-nonexistent Supabase project (Storage-upload-failure fallback). Actual successful Storage upload not live-tested — no real bucket was available in the dev environment.
- **Design note**: reuses the existing `image_url` column directly (overwritten with the best available URL) instead of adding a separate `stored_image_url` column as originally proposed.
- **Also fixed**: applied the Phase 4 lesson proactively — the two new optional env vars (`SUPABASE_STORAGE_BUCKET`, `DEFAULT_FALLBACK_IMAGE_URL`) were added to `.github/workflows/news.yml`'s `env:` block in the same change that introduced them.

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
