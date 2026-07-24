# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). Versions abhi formally tag nahi ki gayi hain (project pre-v1, continuous deployment via `main`) — entries chronological hain, git history ke mutabiq.

## [Unreleased]

### Added
- Full project documentation suite: `PROJECT_OVERVIEW.md`, `PROJECT_ROADMAP.md`, `PROJECT_RULES.md`, `TECH_STACK.md`, `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `API_DOCUMENTATION.md`, `BOT_ARCHITECTURE.md`, `AI_PIPELINE.md`, `FOLDER_STRUCTURE.md`, `UI_UX_GUIDELINES.md`, `CODING_STANDARDS.md`, `DEVELOPMENT_WORKFLOW.md`, `DEPLOYMENT_GUIDE.md`, `TESTING_GUIDE.md`, `SECURITY_GUIDELINES.md`, `CONTRIBUTING.md`.
- 9-phase project roadmap (Stability → Multi-Source → AI Pipeline → Publishing → Images → Website → Dashboard → Monitoring → Scale).

### Known Issues (tracked in `PROJECT_ROADMAP.md` Phase 1)
- Duplicate detection check exists but does not actually skip reprocessing (skip action is disabled in code).
- Only the top RSS item is processed per run; other items are ignored.
- Single hardcoded RSS source (BBC).
- AI response parsing is regex-based and can silently produce empty fields on format mismatch.
- Generated images are not permanently stored (on-the-fly URL only).
- No automated tests.

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
