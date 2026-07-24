# Architecture

## High-Level System Diagram (Target State)

```
                    ┌──────────────────────┐
                    │   RSS Sources         │
                    │ (BBC, Al Jazeera,     │
                    │  Dawn, Geo, ARY —     │
                    │  Reuters excluded,    │
                    │  see Phase 2 notes)   │
                    └──────────┬────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   News Collector      │  (✅ Phase 1-2 done)
                    │  - fetch feeds        │
                    │  - normalize items    │
                    └──────────┬────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   Duplicate Check      │  (Phase 1)
                    │  - query Supabase by  │
                    │    URL                │
                    └──────────┬────────────┘
                               │ (new items only)
                               ▼
                    ┌──────────────────────┐
                    │   AI Processor         │  (Phase 3)
                    │  - Gemini LLM call     │
                    │  - Urdu translation    │
                    │  - summary/category    │
                    │  - hashtags/SEO title  │
                    │  - image prompt        │
                    └──────────┬────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   Image Pipeline       │  (Phase 5)
                    │  - generate image      │
                    │  - store permanently   │
                    └──────────┬────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   Database (Supabase) │  (Phase 0 — done)
                    │  table: news           │
                    └──────────┬────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                                 ▼
   ┌────────────────────┐            ┌───────────────────────┐
   │  Website             │            │  Social Media Publisher│
   │  (Nexora News Urdu)  │  (Phase 6) │  FB/Telegram/WA/X       │  (Phase 4)
   └──────────┬───────────┘            └───────────┬────────────┘
              │                                    │
              └────────────────┬───────────────────┘
                                ▼
                    ┌──────────────────────┐
                    │   Analytics/Monitoring│  (Phase 8)
                    └──────────────────────┘
```

## Components

### 1. News Collector
Fetches RSS feeds from configured sources — a `SOURCES` array in `index.js` (BBC, Al Jazeera, Dawn, Geo News, ARY News as of Phase 2). Each source is fetched independently; one source failing doesn't block the others. Reuters was evaluated and excluded (public RSS feeds no longer live — see `PROJECT_ROADMAP.md` Phase 2).

### 2. Duplicate Check
Queries Supabase `news` table by `url` before processing, to avoid reprocessing/re-publishing the same article. Currently has a bug (check exists but skip action is disabled) — fixed in Phase 1.

### 3. AI Processor
Sends the headline to Google's Gemini API (`gemini-3.5-flash-lite`) with a prompt and a `responseSchema` (Phase 3), requesting category, Urdu title/summary/article, an SEO title, hashtags, Facebook post text, and an image prompt as strict structured JSON — Gemini's own API enforces the shape, so the bot just does `JSON.parse` (no more regex). See `AI_PIPELINE.md` for why Gemini was chosen over Groq (which this project used until this migration) and how schema correctness was verified.

### 4. Image Pipeline (planned — Phase 5)
Currently constructs an on-the-fly `pollinations.ai` URL from the AI's image prompt (not downloaded/stored). Phase 5 adds downloading, optimizing, and storing images permanently (Supabase Storage or similar).

### 5. Database (Supabase)
Single `news` table is the system's source of truth (see `DATABASE_SCHEMA.md`). All downstream consumers (website, social publishers, analytics) read from here — not from RSS/AI directly — to avoid duplicated logic.

### 6. Website (planned — Phase 6)
Nexora News Urdu — will read processed news from Supabase and render Urdu-language pages. Integration approach (existing external site vs. new build) is TBD (see open question in `PROJECT_ROADMAP.md`).

### 7. Social Media Publisher (planned — Phase 4)
Independent publishers per channel (Facebook Graph API, Telegram Bot API, WhatsApp Business API, X API), each reading unpublished items from the Database and marking them as published once done.

### 8. Automation/Orchestration
Currently: a single GitHub Actions workflow (`news.yml`) runs `node index.js` hourly, doing collect → dedupe → AI process → save in one linear script execution. As phases progress (multi-source, multi-channel publishing), this may split into multiple workflows/jobs (e.g., separate "collect+process" job vs. "publish" job) — see Phase 9 for queue-based evolution.

## Design Principles

1. **Single processing, multiple consumption** — news is processed by AI exactly once; website and social channels both consume the same processed record.
2. **Idempotency** — duplicate checks and publish-status tracking ensure the same article isn't reprocessed or republished.
3. **Fail-soft** — a failure in one item/source/channel should not halt the entire pipeline (Phase 1 principle).
4. **Config over code** — sources, categories, and channel credentials should be configuration, not hardcoded values, to ease scaling (Phase 2, Phase 7).

## Current Implementation vs. Target

The current `index.js` implements a simplified, linear version of the top portion of this diagram (Collector → Duplicate Check → AI Processor → Database), for a single source and a single item per run. The rest of the diagram represents the target architecture as phases in `PROJECT_ROADMAP.md` are implemented.
