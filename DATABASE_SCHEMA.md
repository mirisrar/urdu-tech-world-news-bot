# Database Schema

**Database**: Supabase (Postgres)

## Table: `news`

Yeh current table hai jo `index.js` use kar raha hai. Neeche columns hain jo abhi actively insert/select ho rahe hain, plus proposed additions future phases ke liye.

### Current Columns (in use)

| Column | Type (assumed) | Nullable | Description |
|---|---|---|---|
| `id` | `bigint` / `uuid` (auto) | No | Primary key (Supabase default) |
| `title` | `text` | No | Original (English) headline from RSS |
| `source` | `text` | No | News source name (e.g. `"BBC"`) |
| `url` | `text` | No | Original article URL — used for duplicate detection |
| `category` | `text` | Yes | AI-classified category (e.g. Technology, World) |
| `urdu_title` | `text` | Yes | AI-translated Urdu headline |
| `urdu_summary` | `text` | Yes | AI-generated 2-sentence Urdu summary |
| `article` | `text` | Yes | AI-generated ~300 word Urdu article |
| `hashtags` | `text` | Yes | AI-generated hashtags (space/comma separated) |
| `facebook_post` | `text` | Yes | AI-generated ready-to-publish Facebook post text |
| `image_prompt` | `text` | Yes | AI-generated prompt used for image generation |
| `image_url` | `text` | Yes | Image URL to actually use for the article — a **permanent Supabase Storage URL** if upload succeeded (Phase 5), otherwise a graceful fallback (raw Pollinations.ai URL, a configured default, or empty). See `imagePipeline.js`. |
| `created_at` | `timestamptz` (auto) | No | Row creation timestamp (Supabase default, assumed) |

> **Note**: Exact column types/constraints should be confirmed directly in the Supabase dashboard/schema — this document reflects what the application code (`index.js`) reads/writes, not a verified `CREATE TABLE` statement. Recommend exporting the actual schema (via Supabase SQL editor: `\d news` or the Table Editor) and syncing it here.

### ⚠️ Required Migration (Phase 3 + Phase 4 — action needed)

`index.js` now generates/tracks several fields that likely don't have matching columns on your Supabase table yet — this change has no database credentials and cannot run migrations itself. Run this in the Supabase SQL editor:

```sql
-- Phase 3: AI-generated SEO title
ALTER TABLE news ADD COLUMN IF NOT EXISTS seo_title text;

-- Phase 4: publish-status tracking (one column per channel + a timestamp)
ALTER TABLE news ADD COLUMN IF NOT EXISTS fb_post_id text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS telegram_message_id text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS whatsapp_status text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS x_post_id text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS published_at timestamptz;
```

Until this is run, `saveNews()`/`updatePublishStatus()` will detect each missing column (Postgres error `42703`) one at a time, log a warning, and automatically retry the write without it (via the generic `writeWithColumnFallback()` helper in `index.js`) — so the bot **won't break**, but these fields won't be persisted until the columns are added.

### ⚠️ Required Setup (Phase 5 — Supabase Storage bucket)

`imagePipeline.js` uploads optimized images to a Supabase Storage bucket (default name `news-images`, configurable via `SUPABASE_STORAGE_BUCKET`). **This bucket must be created manually** (Supabase dashboard → Storage → New bucket → mark it **public** so `getPublicUrl()` URLs are actually reachable). Until it exists, image uploads fail and the bot automatically falls back to the pre-Phase-5 on-the-fly Pollinations.ai URL — nothing breaks, but images won't be permanently stored.

> **Design note**: a separate `stored_image_url` column was originally proposed for this (see below), but the implementation instead **overwrites `image_url` directly** with whichever URL is actually usable (permanent or fallback) — one column, one source of truth, simpler for every consumer (publishers, future website) to read.

### Proposed Additions (per `PROJECT_ROADMAP.md`, later phases)

| Column | Type | Phase | Purpose |
|---|---|---|---|
| `published_website_at` | `timestamptz` | Phase 6 | Timestamp when shown on website |
| `status` | `text` (enum-like: `pending`, `processed`, `published`, `failed`) | Phase 1/4 | Overall pipeline status tracking |
| `error_log` | `text` | Phase 1/8 | Last error message, if processing/publishing failed |
| `views` | `integer` | Phase 8 | Website view count (analytics) |
| `engagement_score` | `numeric` | Phase 8 | Aggregated social engagement metric |

### Indexes (recommended)

- Unique index on `url` (enforce duplicate prevention at the DB level, not just application logic).
- Index on `category` (for website filtering — Phase 6).
- Index on `status` (for publisher queries — Phase 4).

### Future Tables (proposed, later phases)

| Table | Purpose | Phase |
|---|---|---|
| `rss_sources` | Configurable list of RSS feed URLs + category mapping + enabled/disabled flag | Phase 2, Phase 7 |
| `bot_runs` | Log of each automation run (start/end time, items processed, errors) | Phase 8 |
| `admin_settings` | Key-value settings for dashboard-managed configuration | Phase 7 |
| `admin_users` | Dashboard authentication (if not using Supabase Auth directly) | Phase 7 |

## Duplicate Prevention Strategy

Current logic (`index.js`) queries `news` by `url` before processing. Recommended improvement (Phase 1): add a **unique constraint** on `url` at the database level as a safety net, so even if application logic fails, a duplicate insert is rejected rather than silently succeeding.
