# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). Versions abhi formally tag nahi ki gayi hain (project pre-v1, continuous deployment via `main`) — entries chronological hain, git history ke mutabiq.

## [Unreleased]

### Added
- Full project documentation suite: `PROJECT_OVERVIEW.md`, `PROJECT_ROADMAP.md`, `PROJECT_RULES.md`, `TECH_STACK.md`, `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `API_DOCUMENTATION.md`, `BOT_ARCHITECTURE.md`, `AI_PIPELINE.md`, `FOLDER_STRUCTURE.md`, `UI_UX_GUIDELINES.md`, `CODING_STANDARDS.md`, `DEVELOPMENT_WORKFLOW.md`, `DEPLOYMENT_GUIDE.md`, `TESTING_GUIDE.md`, `SECURITY_GUIDELINES.md`, `CONTRIBUTING.md`.
- 9-phase project roadmap (Stability → Multi-Source → AI Pipeline → Publishing → Images → Website → Dashboard → Monitoring → Scale).
- Structured logger, retry-with-backoff for Groq calls, and per-item run summary logging in `index.js`.

### Fixed (Phase 1 — Stability & Bug Fixes)
- Duplicate news items are now actually skipped (previously detected but the skip `return` was commented out).
- Bot now processes up to 5 fresh RSS items per run instead of only `feed.items[0]`.
- A single item's failure (AI error, malformed response, DB error) no longer aborts the whole run — errors are isolated per item.
- AI responses are now validated (required fields must be present) before saving; invalid/incomplete responses are retried, then skipped and logged instead of being saved with empty fields.
- Fixed regex field extraction so multi-line fields (`ARTICLE`, `FACEBOOK_POST`) capture their full content instead of truncating to a single line.
- Removed debug logging that dumped the Groq API key length and full raw API responses to the console.

### Known Issues (remaining, tracked in `PROJECT_ROADMAP.md`)
- Single hardcoded RSS source (BBC) — Phase 2.
- AI output is still free-text/regex-parsed rather than structured JSON — Phase 3.
- Generated images are not permanently stored (on-the-fly URL only) — Phase 5.
- No automated tests — see `TESTING_GUIDE.md`.

## History (from git log, summarized)

- **2026-07 (early)**: Initial bot implementation — RSS fetch (BBC), Groq AI integration for Urdu translation/summary/categorization, Supabase storage, GitHub Actions hourly cron.
- **2026-07**: Iterative fixes to `index.js` and `news.yml` — model switch (Gemini → Groq), response parsing adjustments, workflow tuning (37 commits total prior to this documentation pass).

> Note: Since prior commits used generic messages (e.g. "Update index.js") without a changelog discipline, this history section is a best-effort summary. Going forward, follow `PROJECT_RULES.md` (Conventional Commits) and update this file with each meaningful change so future entries are precise.

## How to Add Entries Going Forward

Under `[Unreleased]`, add entries as you work, categorized as:
- `Added` — new features
- `Changed` — changes to existing functionality
- `Fixed` — bug fixes
- `Removed` — removed features
- `Security` — security-related fixes

When a meaningful milestone is reached (e.g. "Phase 1 complete"), consider cutting a version (e.g. `v0.1.0`) and moving `[Unreleased]` entries under a dated version heading.
