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
   │  (Nexora News Urdu)  │  (Phase 6) │  FB/Telegram/X/WhatsApp │  (✅ Phase 4 done)
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
Fetches items from configured sources: a `SOURCES` array of RSS feeds in `index.js` (BBC, Al Jazeera, Dawn, Geo News, ARY News as of Phase 2), plus an optional NewsAPI.org keyword source. Each source is fetched independently; one source failing doesn't block the others. Reuters was evaluated and excluded (public RSS feeds no longer live — see `PROJECT_ROADMAP.md` Phase 2).

### 2. Duplicate Check
Queries Supabase `news` table by `url` before processing, to avoid reprocessing/re-publishing the same article. Fixed in Phase 1 (previously detected but didn't actually skip).

### 3. AI Processor
Sends the headline to Google's Gemini API (`gemini-3.5-flash-lite`) with a prompt and a `responseSchema` (Phase 3), requesting category, Urdu title/summary/article, an SEO title, hashtags, Facebook post text, and an image prompt as strict structured JSON — Gemini's own API enforces the shape, so the bot just does `JSON.parse` (no more regex). See `AI_PIPELINE.md` for why Gemini was chosen over Groq (which this project used until this migration) and how schema correctness was verified.

### 4. Image Pipeline (planned — Phase 5)
Currently constructs an on-the-fly `pollinations.ai` URL from the AI's image prompt (not downloaded/stored). Phase 5 adds downloading, optimizing, and storing images permanently (Supabase Storage or similar).

### 5. Database (Supabase)
Single `news` table is the system's source of truth (see `DATABASE_SCHEMA.md`). All downstream consumers (website, social publishers, analytics) read from here — not from RSS/AI directly — to avoid duplicated logic.

### 6. Website (planned — Phase 6)
Nexora News Urdu — will read processed news from Supabase and render Urdu-language pages. Integration approach (existing external site vs. new build) is TBD (see open question in `PROJECT_ROADMAP.md`).

### 7. Social Media Publisher (✅ Phase 4 done)
`publishers/` module — one file per channel (Facebook Graph API, Telegram Bot API, X API v2 with manual OAuth1.0a, WhatsApp Business Cloud API) plus an orchestrator (`publishAll()`). Currently called **inline** right after a successful save (not as a separate job reading "unpublished" rows from the Database, which is the longer-term target once a `status` column exists — see Phase 9 notes) — each channel is independently optional and fail-soft. See `PROJECT_ROADMAP.md` Phase 4 for the WhatsApp scope adjustment (template messages to opted-in recipients, not public "Channel" broadcasts, which have no public API).

### 8. Automation/Orchestration
Currently: a single GitHub Actions workflow (`news.yml`) runs `node index.js` hourly, doing collect → dedupe → AI process → save → publish in one linear script execution per item. As phases progress (website integration, admin dashboard), this may split into multiple workflows/jobs (e.g., separate "collect+process" job vs. "publish" job, driven by a `status` column) — see Phase 9 for queue-based evolution.

## Design Principles

1. **Single processing, multiple consumption** — news is processed by AI exactly once; website and social channels both consume the same processed record.
2. **Idempotency** — duplicate checks and publish-status tracking ensure the same article isn't reprocessed or republished.
3. **Fail-soft** — a failure in one item/source/channel should not halt the entire pipeline (Phase 1 principle, extended through Phase 4's publishers).
4. **Config over code** — sources, categories, and channel credentials should be configuration, not hardcoded values, to ease scaling (Phase 2, Phase 7).
5. **Graceful schema drift** — new optional columns (`seo_title`, `fb_post_id`, etc.) degrade gracefully via `writeWithColumnFallback()` if their DB migration hasn't been applied yet, rather than breaking the whole pipeline (Phase 3/4).

## Current Implementation vs. Target

`index.js` (+ `newsapi.js` + `publishers/`) now implements Collector → Duplicate Check → AI Processor → Database → Social Media Publisher (Phases 1-4), across multiple sources and up to `MAX_ITEMS_PER_RUN` items per run. Remaining: Image Pipeline (Phase 5), Website (Phase 6), Admin Dashboard (Phase 7), Monitoring (Phase 8), Scale (Phase 9) — see `PROJECT_ROADMAP.md`.
