# Database Schema

**Database**: Supabase (Postgres)

## Table: `news`

Yeh **shared** table hai — news bot (`index.js`, `service_role`) aur Nexora Admin CMS (`admin/news.js`, `admin/add-news.js`, `authenticated`) dono isi mein read/write karte hain. Public website sirf **read** karti hai (`anon`).

### Columns (Bot + Admin — aligned)

| Column | Type (assumed) | Who writes | Description |
|---|---|---|---|
| `id` | `bigint` / `uuid` (auto) | DB | Primary key |
| `title` | `text` | Bot + Admin | English headline |
| `urdu_title` | `text` | Bot + Admin | Urdu headline |
| `category` | `text` | Bot + Admin | e.g. Technology, World, AI |
| `urdu_summary` | `text` | Bot + Admin | Short Urdu summary |
| `article` | `text` | Bot + Admin | Full Urdu article body |
| `hashtags` | `text` | Bot + Admin | Space/comma-separated tags |
| `image_url` | `text` | Bot + Admin | Permanent Storage URL or fallback |
| `views` | `integer` (default `0`) | Admin (+ future site) | View counter — Admin CMS shows this |
| `featured` | `boolean` (default `false`) | Admin | Featured flag for curation |
| `reading_time` | `integer` (default `2`) | Admin | Minutes — Admin form field |
| `source` | `text` (nullable, default `'Manual'`) | Bot (Admin optional) | Feed/source name; Admin posts default to `Manual` |
| `url` | `text` (nullable, unique when set) | Bot (Admin optional) | Original article URL — duplicate key for bot |
| `seo_title` | `text` | Bot | AI SEO title (Phase 3) |
| `facebook_post` | `text` | Bot | AI Facebook-ready text |
| `image_prompt` | `text` | Bot | AI image prompt |
| `fb_post_id` | `text` | Bot | Facebook publish id |
| `telegram_message_id` | `text` | Bot | Telegram publish id |
| `whatsapp_status` | `text` | Bot | WhatsApp publish status |
| `x_post_id` | `text` | Bot | X publish id |
| `published_at` | `timestamptz` | Bot | First successful social publish time |
| `created_at` | `timestamptz` (auto) | DB | Row creation timestamp |

> **Note**: Exact types should be confirmed in the Supabase Table Editor. Yeh document application code (bot + Admin CMS) ke mutabiq aligned hai.

### ⚠️ Required Migration — run once in Supabase SQL editor

Canonical file: [`website-integration/database/schema-align.sql`](./website-integration/database/schema-align.sql)

```sql
-- Admin CMS columns
ALTER TABLE news ADD COLUMN IF NOT EXISTS views integer DEFAULT 0;
ALTER TABLE news ADD COLUMN IF NOT EXISTS featured boolean DEFAULT false;
ALTER TABLE news ADD COLUMN IF NOT EXISTS reading_time integer DEFAULT 2;

-- Bot / AI / publish columns
ALTER TABLE news ADD COLUMN IF NOT EXISTS seo_title text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS facebook_post text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS image_prompt text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS fb_post_id text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS telegram_message_id text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS whatsapp_status text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS x_post_id text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- Admin "Add News" does not set source/url — must be nullable
ALTER TABLE news ALTER COLUMN source DROP NOT NULL;
ALTER TABLE news ALTER COLUMN url DROP NOT NULL;
ALTER TABLE news ALTER COLUMN source SET DEFAULT 'Manual';

-- Partial unique URL (bot dedupe; multiple NULL urls OK for manual posts)
CREATE UNIQUE INDEX IF NOT EXISTS news_url_unique_idx ON news (url) WHERE url IS NOT NULL;
CREATE INDEX IF NOT EXISTS news_category_idx ON news (category);
CREATE INDEX IF NOT EXISTS news_featured_idx ON news (featured) WHERE featured = true;
CREATE INDEX IF NOT EXISTS news_created_at_idx ON news (created_at DESC);
```

Bot pehle se missing optional columns ke liye `writeWithColumnFallback()` use karta hai (Postgres `42703`) — lekin Admin CMS usually fail-hard karta hai, isliye yeh migration **Admin ke liye zaroori** hai (`views` / `featured` / `reading_time`, aur nullable `source`/`url`).

### Storage bucket (Phase 5 + Admin uploads)

Bucket name: `news-images` (or `SUPABASE_STORAGE_BUCKET`). **Public for reads.** Create manually in Supabase dashboard if missing.

- Bot uploads with `service_role` (RLS bypass).
- Admin `add-news.js` uploads with the logged-in `authenticated` session — needs Storage policies in `rls-policy.sql`.

## Who can read / write (RLS)

| Actor | Key / role | `news` access | Storage `news-images` |
|---|---|---|---|
| Public website | `anon` | SELECT only | SELECT (public URLs) |
| Admin CMS | `authenticated` (Supabase Auth login) | SELECT, INSERT, UPDATE, DELETE | SELECT, INSERT, UPDATE, DELETE |
| News bot | `service_role` | Full (bypasses RLS) | Full (bypasses RLS) |

Canonical SQL: [`website-integration/database/rls-policy.sql`](./website-integration/database/rls-policy.sql)

```sql
ALTER TABLE news ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon read access on news"
  ON news FOR SELECT TO anon USING (true);

CREATE POLICY "Authenticated read access on news"
  ON news FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated insert on news"
  ON news FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated update on news"
  ON news FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated delete on news"
  ON news FOR DELETE TO authenticated USING (true);
```

(+ matching `storage.objects` policies for bucket `news-images` — see the full SQL file.)

### ⚠️ Setup order (critical)

1. Add GitHub Actions secret `SUPABASE_SERVICE_ROLE_KEY` (bot writes).
2. Confirm Admin login uses **Supabase Auth** (`signInWithPassword` / session JWT → role `authenticated`). Agar Admin sirf custom password + anon key se write kar raha ho, RLS apply hote hi **edit/save/delete fail** ho jayenge.
3. Run `schema-align.sql`, phir `rls-policy.sql`.
4. (Optional) Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE news;`

### Admin Auth checklist

- Supabase dashboard → Authentication → Users: kam az kam ek admin user banao.
- Admin `auth.js` / login page: Supabase Auth session set kare (anon key client + user JWT).
- **Kabhi bhi** `service_role` key Admin ya public website `config.js` mein mat daalo.

## Future Tables (optional)

| Table | Purpose | Notes |
|---|---|---|
| `rss_sources` | Configurable RSS list | Deferred — bot config still code/env based |
| `bot_runs` | Run history / errors | Phase 8 monitoring |
| `admin_settings` | Dashboard key-value settings | Optional; not required for news CRUD |

## Duplicate Prevention

- Application: bot checks `news.url` before insert.
- Database: partial unique index `news_url_unique_idx` on `url WHERE url IS NOT NULL`.
