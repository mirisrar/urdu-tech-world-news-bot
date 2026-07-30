# Roadmap — Urdu Tech & World News Bot

Yeh roadmap current codebase (RSS fetch → Gemini AI translation/summary → Supabase storage → GitHub Actions cron) ke upar based hai.

**Status:** Phase 0 → 9 **complete** (MVP + publish + website integration).  
**Agay:** Phase 10+ — SEO & growth (neeche “Next Roadmap” section).

Pehli wave (Phase 0–9) ideal end-to-end flow ke mutabiq structured thi.

## Target Flow

```
RSS Sources
      │
      ▼
News Collector
      │
      ▼
Duplicate Check
      │
      ▼
AI Processor
      │
      ▼
Database
      │
      ▼
Website
      │
      ▼
Social Media Publisher
      │
      ▼
Analytics
```

**Faida is order ka:**
- News pehle AI se process hoti hai, tabhi kisi channel par jaati hai.
- Website aur social media dono ko **same processed content** milta hai — duplicate logic nahi likhni padti.
- SEO aur categories automatically ready hoti hain (AI Processor ka output).
- Future mein naye publishing channels add karna aasaan ho jata hai (sirf Database se read karke naya publisher jorna hai).

---

## Phase 0 — Current State (✅ Done)

- [x] BBC RSS feed se news fetch (`rss-parser`)
- [x] AI (Gemini `gemini-3.5-flash-lite`, originally Groq) se Urdu translation + summary + article + hashtags + Facebook post + image prompt generate karna
- [x] Supabase mein `news` table mein data save karna
- [x] GitHub Actions cron job (har ghante) se automation

---

## Phase 1 — Stability & Bug Fixes — 🔴 Critical (✅ Implemented — see PR #2)

Pehle jo bana hai usay reliable banao, tabhi upar naya kaam karna faida dega.

- [x] **Duplicate bug fix**: `existing.length > 0` check ke baad `return;` ko actually enable karo (abhi comment out hai).
- [x] **Multi-item processing**: `feed.items[0]` ki jagah loop lagao (top 5–10 items), taake sirf headline hi baar baar process na ho.
- [x] **Per-item error isolation**: Ek item fail ho to pura run crash na ho, baaki items continue hon.
- [x] **Retry logic**: AI API ya Supabase call fail ho to 1–2 retries with backoff.
- [x] **Logging cleanup**: Debug dumps (API key length, raw JSON) hata kar structured, concise logs rakho.
- [x] **AI response validation**: Format match na ho to item skip/log karo, empty strings DB mein save na karo.
- [x] **(Bonus, pre-Phase-2) AI provider migration**: Groq → Gemini (`gemini-3.5-flash-lite`). See `AI_PIPELINE.md` §"Why Gemini" for reasoning.

**Done criteria**: Bot bina duplicate ya crash ke, multiple fresh news items reliably process kar sake.

**Status**: Code implemented in `index.js` (see PR: `cursor/phase1-stability-fixes-2a5f`). Pending: manual verification against live Supabase/Gemini secrets before considering fully done (no automated tests exist yet — see `TESTING_GUIDE.md`). **Action needed**: add `GEMINI_API_KEY` GitHub Actions secret (replaces `GROQ_API_KEY`).

---

## Phase 2 — Multi-Source News Collection — 🟠 High (✅ Implemented — see PR #3)

- [x] RSS sources ko config array mein rakho (BBC, Reuters, Dawn, Geo, ARY, Al Jazeera, etc.) — hardcoded single URL hatao.
- [x] Har source ke liye `source` field DB mein already hai — sirf loop se sab feeds process karo.
- [ ] Category-wise source mapping (Tech, World, Business, Sports) agar niche-specific audience chahiye. *(deferred — not required for "3+ sources" done criteria)*
- [x] Gemini calls ke beech rate-limiting/throttling (free-tier quota se bachne ke liye).

**Done criteria**: Bot 3+ independent sources se news collect kare, bina ek dusre ko block kiye.

**Status**: Implemented — 5 sources configured (BBC, Al Jazeera, Dawn, Geo News, ARY News), each live-tested with the actual `rss-parser` library before committing. `collectItems()` fetches each source independently (fail-soft — one source failing doesn't block the others), with `MAX_ITEMS_PER_SOURCE`/`MAX_ITEMS_PER_RUN` caps and `AI_CALL_SPACING_MS` throttling to bound AI-call volume as sources grow.

**⚠️ Reuters excluded**: Reuters was in the originally proposed source list, but their public RSS feeds were discontinued around 2020 — the documented feed URLs (e.g. `feeds.reuters.com/...`, `reutersagency.com/feed/`) were verified via `curl` to return a 404 or a marketing page, not valid RSS. If Reuters content is genuinely needed later, it would require either a paid Reuters API/syndication agreement or scraping (out of scope for this bot's current approach) — not a simple RSS URL swap.

**Category-wise source mapping deferred**: mapping specific sources to specific categories (e.g. "this feed is Tech-only") wasn't implemented, since the "3+ independent sources" done criteria didn't require it and Phase 3's AI-based category classification already assigns a category per article regardless of source. Revisit if a future need arises (e.g. a source-specific trust/curation policy).

**Bonus, pre-Phase-3 addition (see PR #4)**: **NewsAPI.org** added as a 6th, *optional* source (`newsapi.js`, keyword-based search e.g. `"technology"`). Skipped automatically if `NEWS_API_KEY` isn't set — doesn't affect anyone not using it. ⚠️ Success path (valid key → real articles) couldn't be live-tested in the dev environment (no real `NEWS_API_KEY` available there) — error-handling paths were verified against the real API and via mocks; recommend a manual verification run with a real key before relying on it in production.

---

## Phase 3 — AI Processing Pipeline — 🔴 Critical (✅ Implemented — see PR #5)

Yeh project ka core/differentiating feature hai — isay apna dedicated phase milna chahiye.

- [x] Urdu translation + summary (already implemented — refine karo).
- [x] Category classification (already implemented — accuracy improve karo).
- [x] Hashtag generation.
- [x] **SEO-friendly title** generate karna (naya — website ke liye zaroori). *(generated; DB storage needs a migration — see below)*
- [x] Image prompt generation (already implemented).
- [x] AI output ko strict JSON schema mein return karwana (regex parsing ki jagah — reliability ke liye).
- [x] Prompt versioning/testing — taake future mein prompt improve karna easy ho.

**Done criteria**: Har news item ke liye consistent, structured, validated AI output milay jo Database, Website, aur Social sab consume kar sakein.

**Status**: Implemented — Gemini's native structured output (`responseMimeType: "application/json"` + `responseSchema`) replaced the old free-text/regex pipeline entirely. Schema correctness verified against the real Gemini API (live requests with an invalid key: correctly-typed schema → only an auth error; intentionally broken schema → a schema-specific validation error). `PROMPT_VERSION` constant added for versioning. Full success-path content (real structured response, real Urdu translation quality) **not yet live-verified** — no real `GEMINI_API_KEY` was available in the dev environment.

**⚠️ Action needed — `seo_title` DB migration**: run `ALTER TABLE news ADD COLUMN IF NOT EXISTS seo_title text;` in Supabase (see `DATABASE_SCHEMA.md`). Until then, the bot degrades gracefully (retries the insert without `seo_title`, logs a warning) rather than breaking, but SEO titles won't be persisted.

---

## Phase 4 — Social Media Publishing Layer — 🟠 High (✅ Implemented — see PR #6)

> **Scope note**: Website yahan include nahi hai — wo Phase 6 mein alag handle hoti hai, taake dono phases overlap na karein.

- [x] **Facebook Graph API** integration — generated post + image automatically Page par publish karna.
- [x] **Telegram** channel bot integration.
- [x] **WhatsApp Business API** integration (agar audience wahan hai). *(scope-adjusted — see note below)*
- [x] **X/Twitter** posting (short-form version).
- [x] Publish status tracking DB mein (`published_at`, per-platform post ID columns) taake dobara publish na ho.

**Done criteria**: Naya processed news item bina manual intervention sab configured social channels par live nazar aaye.

**Status**: `publishers/` module implemented — ek file per channel + orchestrator (`publishAll()`), `index.js` mein wire kiya gaya hai taake har successfully-saved article automatically publish ho. Har channel independent aur optional hai (env vars set na hon to silently skip), aur fail-soft hai (ek channel fail ho to baaki aur khud article ka save unaffected rehta hai). Request format/error-handling **real platform APIs ke against verify** kiya gaya hai (fake credentials se — sab APIs correctly reachable hain aur expected auth errors return karte hain), lekin **actual successful publish kabhi live test nahi ho saka** — is environment mein kisi bhi platform ka real account/token available nahi tha.

**⚠️ WhatsApp scope adjustment (important)**: Roadmap mein originally "WhatsApp channel" jaisa broadcast socha gaya tha (Telegram jaisa). Research karne par pata chala: **as of 2026, WhatsApp Channels ka koi official public API nahi hai** — sirf unofficial/ToS-violating reverse-engineered gateways yeh claim karte hain, jo account-ban risk carry karte hain. Isliye implement nahi kiya. Jo legitimately possible tha, wo implement kiya: **WhatsApp Business Cloud API** se pre-approved template messages, individual opted-in recipients ko (private broadcast, public channel post nahi). Isay use karne ke liye Meta se ek approved message template chahiye hoga.

**⚠️ Action needed — DB migration for publish-status tracking**: `fb_post_id`, `telegram_message_id`, `whatsapp_status`, `x_post_id`, `published_at` columns abhi Supabase table mein nahi hain (see `DATABASE_SCHEMA.md` for the `ALTER TABLE` statements). Bot degrade gracefully karta hai (same mechanism jo `seo_title` ke liye tha, ab generalized — `writeWithColumnFallback()`), lekin publish status tab tak persist nahi hoga jab tak migration run na ho.

---

## Phase 5 — Image Pipeline — 🟡 Medium (✅ Implemented — see PR #7)

- [x] AI se generated image ko **download** karo aur Supabase Storage (ya CDN) mein permanently upload karo — abhi sirf on-the-fly pollinations.ai URL hai.
- [x] Image optimize/resize karo (web + social media dimensions ke mutabiq).
- [x] Fallback/default image agar generation fail ho.
- [x] Social posts aur website dono same stored image use karein.

**Done criteria**: Har processed news item ke saath ek stable, permanently-hosted, optimized image ho.

**Status**: `imagePipeline.js` implemented — download (Pollinations.ai) → optimize (`sharp`: 1200x630, WebP quality 80) → upload (Supabase Storage). 4-level graceful fallback chain (permanent URL → raw Pollinations URL → configured default → empty string), never throws. Download+optimize verified live against the real Pollinations API; Storage-upload path verified to fall back gracefully when the target project/bucket doesn't exist. **Actual successful Storage upload not live-tested** — no real Supabase Storage bucket was available in the dev environment.

**⚠️ Action needed — Supabase Storage bucket**: create a **public** bucket (default name `news-images`, configurable via `SUPABASE_STORAGE_BUCKET`) in your Supabase project. Until this exists, the bot automatically falls back to the pre-Phase-5 on-the-fly Pollinations URL — nothing breaks, but images won't be permanently stored.

**Design note**: rather than adding a separate `stored_image_url` column (as originally proposed), the permanent URL now simply **replaces** the value in the existing `image_url` column — one column, one source of truth for "the image to use," whether it's permanent or a fallback. See `DATABASE_SCHEMA.md`.

---

## Phase 6 — Website Integration (Nexora News Urdu) — 🟠 High (✅ Implemented — see PR #8)

> **✅ Resolved**: "Nexora News Urdu" ek existing, already-built website hai — HTML5, CSS3 (Modular CSS), Vanilla JS (ES6+), Supabase backend, Vercel hosting, GitHub version control, koi framework/CMS nahi. Integration approach: **direct Supabase client read** (website khud Supabase se data leti hai, koi webhook nahi chahiye).

- [x] Processed news (Database se) website par automatically show karna.
- [x] Category filter, search, latest-news homepage.
- [x] SEO-friendly URLs har article ke liye (Phase 3 ka SEO title yahan use hoga).
- [x] Website aur social publishing dono same Database record se content lein (duplicate logic avoid karne ke liye).

**Done criteria**: Naya processed news item automatically Nexora News Urdu website par nazar aaye, bina manual publish kiye.

**Status**: `website-integration/` folder implemented (bot repo mein, website repo mein copy karne ke liye) — modular vanilla JS: `newsApi.js` (hero, breaking, latest with pagination/category filter, trending, categories, search, single article), `realtime.js` (Supabase Realtime subscription — naya article save hote hi live update, bina refresh, koi webhook nahi), `utils.js`, aur working example HTML pages. Har `newsApi.js` function ka actual generated PostgREST query real `@supabase/supabase-js` package se verify kiya gaya (mock-`fetch` intercept kar ke) — real Supabase project available na hone ki wajah se live end-to-end test nahi ho saka.

**⚠️⚠️ Critical security fix (isi PR mein included)**: website ka anon key ab publicly browser mein visible hoga. Isay safe rakhne ke liye RLS ko "anon = read-only" karna zaroori hai (`website-integration/database/rls-policy.sql`) — lekin isse **bot khud anon key se likh nahi payega**. Bot ab `SUPABASE_SERVICE_ROLE_KEY` prefer karta hai apne writes ke liye (RLS bypass karta hai, sirf server-side/GitHub Actions secrets mein rakhna hai, kabhi website ko expose nahi karna). `SUPABASE_ANON_KEY` par fallback hai (warning ke sath) jab tak migrate na karo.

**⚠️ Action needed (is exact order mein)**:
1. Supabase dashboard → Settings → API se `service_role` key copy karo, GitHub Actions secret `SUPABASE_SERVICE_ROLE_KEY` ke tor par add karo.
2. `website-integration/database/rls-policy.sql` Supabase SQL editor mein run karo (anon ko read-only kar dega).
3. (Optional, live updates ke liye) Supabase dashboard → Database → Replication → `news` table ON karo.
4. `website-integration/` ki files Nexora News Urdu repo mein copy karo, `config.example.js` → `config.js` bana kar apna `SUPABASE_URL`/anon key daalo.

**Design decisions** (poora detail `website-integration/README.md` mein):
- "Hero" = sabse recent article (Admin CMS ka `featured` flag curation ke liye available hai — public site hero logic abhi bhi recency-based ho sakti hai jab tak website `featured` prefer na kare).
- "Breaking" = last 2 hours (heuristic, kabhi empty nahi hota — fallback built-in).
- "Trending" = abhi recency-based hai; jab `views` column populate hoga, automatically switch ho sakta hai.
- Article URLs `?id=<db-id>` use karti hain — pretty/slug URLs future enhancement hai.

---

## Phase 7 — Admin Dashboard — ✅ Done (existing Nexora CMS)

Nexora News Urdu website pe **Admin CMS pehle se maujood** hai (alag rebuild is bot repo mein nahi kiya). Verified against live Admin files: `admin/dashboard.html`, `admin/news.html`, `admin/add-news.html`, `admin/js/news.js`, `admin/js/add-news.js`.

- [x] News items manage karna — list / search / category filter (`news.js`).
- [x] Edit + save — `add-news.html?id=…` → Supabase `.update()` (`add-news.js`).
- [x] Delete — confirm dialog → Supabase `.delete()` (`news.js`).
- [x] Add / publish news — form insert + image upload to `news-images` bucket.
- [x] Auth gate — `auth.js` + logout; **must use Supabase Auth** so RLS `authenticated` policies apply (see below).
- [x] Same Supabase `news` table as the bot (shared schema + RLS alignment delivered in this phase).
- [ ] *(Deferred / optional)* Bots/RSS sources on/off toggle UI — bot sources abhi code/env driven hain.
- [x] *(Phase 8)* Bot run health alert via Telegram (see Phase 8) — full logs viewer still optional.
- [ ] *(Deferred / optional)* API keys & cron settings UI — secrets GitHub Actions mein rehte hain (browser mein expose nahi karne).

**Done criteria**: Non-technical admin bina code touch kiye news manage (add/edit/save/delete) kar sake — **met** by existing Nexora CMS.

**Status**: Admin UI website side pe already complete. Is bot repo ka Phase 7 deliverable = **schema + RLS alignment** taake Bot (`service_role`), Admin (`authenticated`), aur Public site (`anon` read-only) teeno bina conflict ke same table use karein.

**⚠️ Action needed (Supabase SQL editor, isi order mein)**:
1. `SUPABASE_SERVICE_ROLE_KEY` GitHub Actions secret confirm karo (bot).
2. Admin login ko Supabase Auth par ensure karo (custom anon-only password gate RLS ke baad writes tod dega).
3. Run [`website-integration/database/schema-align.sql`](./website-integration/database/schema-align.sql) — Admin columns (`views`, `featured`, `reading_time`) + nullable `source`/`url` + bot columns.
4. Run [`website-integration/database/rls-policy.sql`](./website-integration/database/rls-policy.sql) — anon SELECT; authenticated CRUD; Storage policies for `news-images`.
5. Supabase Auth mein kam az kam ek admin user banao.

Detail: `DATABASE_SCHEMA.md`, `SECURITY_GUIDELINES.md`.

---

## Phase 8 — Monitoring & Analytics — ✅ Done (split: existing Admin analytics + bot alerts)

### A) Content / engagement analytics — existing Nexora CMS (no rebuild)

Verified against Admin files: `admin/analytics.html`, `admin/js/analytics.js`.

- [x] Total news / views / featured / categories cards.
- [x] Top viewed articles, views chart, category pie chart.
- [x] Publishing report (today / week / month).
- [x] CSV export + print.
- [x] Reads shared Supabase `news` table (`views`, `featured`, `category`, `created_at`) behind `auth.js`.

Social-platform likes/shares sync (Facebook/X metrics pull) **not** in scope — Admin uses DB `views`, not live social APIs.

### B) Bot health monitoring — implemented in this bot repo

- [x] End-of-run Telegram health alert (`monitoring/runAlert.js`) — processed / skipped / failed / duration + error snippets.
- [x] Fatal-run alert from `run().catch(...)`.
- [x] Fail-soft (alert failure never breaks the bot).
- [x] Optional `TELEGRAM_ALERT_CHAT_ID` (private ops chat) + `TELEGRAM_ALERT_MODE` (`always` | `failures` | `off`).
- [ ] *(Deferred / optional)* Dedicated `bot_runs` table + Admin logs viewer UI.
- [ ] *(Deferred / optional)* Per-call API latency / Gemini cost accounting.
- [ ] *(Deferred / optional)* Email alerts (Telegram is the primary channel).

**Done criteria**: System ka health aur content performance bina GitHub Actions logs khole pata chal sake — **met** via Admin Analytics + Telegram run alerts (when Telegram secrets are configured).

**⚠️ Action needed**:
1. `TELEGRAM_BOT_TOKEN` + (`TELEGRAM_ALERT_CHAT_ID` **or** `TELEGRAM_CHAT_ID`) GitHub secrets.
2. Optional: `TELEGRAM_ALERT_MODE=failures` if hourly "all skipped" messages too noisy hon.
3. Website pe `views` increment hona chahiye (article page) warna Analytics mostly zeros dikhega — yeh website-side concern hai, bot nahi.

---

## Phase 9 — Scalability & Optimization — ✅ Done (practical, no Redis)

GitHub Actions + Supabase scale ke liye **Redis/BullMQ skip** kiya — current volume (10-min cron, tens of items/run) pe overkill. Practical optimizations shipped instead:

- [x] **Parallel RSS fetch** — `Promise.allSettled` across all sources (one slow/dead feed doesn't block others).
- [x] **Title-similarity dedupe** (`dedupe.js`) — skip near-duplicate headlines across Google News + Dawn/Geo overlap (Jaccard / containment), on top of URL dedupe.
- [x] **DB-backed publish retry queue** (`publishRetry.js`) — retry recent rows missing social channel IDs; no Redis. `publishAll({ onlyChannels })` retries only what's missing.
- [x] **Env-tunable caps** — `MAX_ITEMS_*`, `TITLE_DEDUPE_LOOKBACK`, `PUBLISH_RETRY_LIMIT`, etc. (see `.env.example` / `news.yml`).
- [ ] *(Deferred — only if volume 10x)* Redis/BullMQ, always-on workers, split collector/AI/publisher services.

**Done criteria**: System bina performance degradation ke, zyada sources/frequency handle kar sake — **met** for current GitHub Actions deployment profile.

---

## Suggested Order of Execution (Wave 1 — done)

1. **Phase 1** — Stability fixes  
2. **Phase 3** — AI Processing Pipeline  
3. **Phase 2** — Multi-source collection  
4. **Phase 4** — Social Media Publishing  
5. **Phase 5** — Image Pipeline  
6. **Phase 6** — Website Integration  
7. **Phase 7–9** — Admin, monitoring, scale  

---

## Progress Tracking — Wave 1 (Phase 0–9)

| Phase | Weight | Status |
|---|---|---|
| Phase 0 — Foundation (MVP pipeline) | 5% | ✅ Done |
| Phase 1 — Stability & Bug Fixes (+ Gemini migration) | 10% | ✅ Done |
| Phase 2 — Multi-Source Collection | 10% | ✅ Done |
| Phase 3 — AI Processing Pipeline (structured JSON, SEO title) | 15% | ✅ Done |
| Phase 4 — Social Media Publishing Layer | 20% | ✅ Done |
| Phase 5 — Image Pipeline | 10% | ✅ Done |
| Phase 6 — Website Integration | 15% | ✅ Done |
| Phase 7 — Admin Dashboard (existing Nexora CMS + RLS/schema align) | 8% | ✅ Done |
| Phase 8 — Monitoring & Analytics (Admin analytics + Telegram run alerts) | 4% | ✅ Done |
| Phase 9 — Scalability & Optimization (parallel RSS, title dedupe, publish retry) | 3% | ✅ Done |
| **Wave 1 total** | **100%** | **✅ Complete** |

**Note:** Wave 1 “Done” = code shipped; kuch external integrations ka live credential verify production secrets pe depend karta hai.

---

# Next Roadmap — Wave 2 (SEO & Growth)

> Focus: Google + social pe discoverability. Bot pehle se `seo_title` / summary / image / category deta hai — **asli SEO kaam website + URL + crawl setup** pe hai.

```
Bot (seo_title, summary, image)
        │
        ▼
Website article pages
  meta + OG + JSON-LD
        │
        ▼
Pretty URLs / slugs
        │
        ▼
sitemap.xml + robots.txt
        │
        ▼
Search Console + indexing
        │
        ▼
Internal links / related news / performance
```

---

## Phase 10 — SEO Foundation (Meta + Share) — 🔴 Critical (🟡 In progress — helpers shipped)

**Kahan:** Nexora website (article + homepage), thoda `website-integration/` helpers.

- [x] `website-integration/seo.js` — `buildArticleSeo` / `applyArticleSeo` / `applyPageSeo`
  - `<title>` = `seo_title` (fallback: `urdu_title`) + brand
  - `<meta name="description">` = `urdu_summary`
  - Open Graph: `og:title`, `og:description`, `og:image`, `og:url`, `og:type`, `og:locale`
  - Twitter Card: `summary_large_image`
  - Canonical URL
  - `lang="ur"` + `dir="rtl"`
- [x] Article + homepage examples wired (`examples/*-example.html`)
- [x] `config.example.js` → `SITE_ORIGIN` + `SITE_NAME`
- [ ] **Website repo:** `seo.js` copy + article/home pages pe `applyArticleSeo` / `applyPageSeo` call
- [ ] Confirm DB mein `seo_title` persist ho raha hai  
  (`SELECT id, seo_title FROM news ORDER BY id DESC LIMIT 10;`)
- [ ] Facebook Sharing Debugger se ek live article preview verify

**Done criteria:** Kisi article ka “View Source” / Facebook Debugger / Twitter Card Validator sahi title, description, image dikhaye — empty ya sirf JS shell nahi.

**Pehle yeh kyun:** Bina meta/OG ke baaki SEO half-blind rehta hai; social shares bhi weak lagte hain.

**Note:** Helpers bot repo mein ready hain. Full crawler-proof OG (Debugger bina JS) ke liye Phase 13 rendering chahiye; pehle website pe `seo.js` wire karo.

---

## Phase 11 — Crawl Index (Sitemap + Robots + Search Console) — 🔴 Critical

**Kahan:** Website root + optional bot/cron jo sitemap regenerate kare.

- [ ] `robots.txt` — allow public pages; block `/admin` etc.
- [ ] `sitemap.xml` (ya `sitemap-index`) — saari public article URLs + lastmod
- [ ] Nayi news aate hi sitemap update (static rebuild, edge function, ya scheduled job)
- [ ] Google Search Console: property + sitemap submit
- [ ] Bing Webmaster (optional, same sitemap)

**Done criteria:** Search Console mein sitemap “Success”; sample URLs “URL inspection” se indexable.

---

## Phase 12 — Pretty URLs + Structured Data — 🟠 High

**Kahan:** Bot schema + website routing + `website-integration/`.

- [ ] DB: `slug` column (unique), AI ya deterministic slug from `seo_title` / `urdu_title`
- [ ] URLs: `/article/<slug>` (ya `/news/<slug>`) — `?id=` sirf fallback
- [ ] Redirects: old `?id=` → new slug (bookmarks / pehle share kiye links)
- [ ] JSON-LD `NewsArticle` (headline, image, datePublished, dateModified, author/publisher, inLanguage: `ur`)
- [ ] Optional: `BreadcrumbList` JSON-LD
- [ ] Facebook / bot caption website link slug-based URL use kare (`WEBSITE_ARTICLE_PATH` update)

**Done criteria:** Shareable clean URL; Rich Results Test mein NewsArticle valid; purani id-URLs tootensi nahi.

---

## Phase 13 — Crawlability & Rendering — 🟠 High

> Abhi site vanilla JS + client fetch hai — Google ko kabhi-kabhi content late / incomplete milta hai.

- [ ] Decide approach (ek choose karo):
  - **A.** Build-time / on-demand static HTML per article (simplest for news), ya
  - **B.** Prerender / SSR for article routes, ya
  - **C.** Hybrid: critical meta server-rendered, body can hydrate
- [ ] Article HTML mein pehla paint pehle se title + summary + body (JS-only shell avoid)
- [ ] Core Web Vitals: LCP image sizing, font, no huge blocking JS
- [ ] 404 + soft-delete handling for removed news (id 1–500 delete jaisa cases)

**Done criteria:** `curl` / “View Source” pe article text dikhe; Lighthouse SEO + performance baseline green-ish on article template.

---

## Phase 14 — On-Page & Content SEO — 🟡 Medium

- [ ] H1 = `urdu_title`; H2s jahan article sections hon
- [ ] Image `alt` = meaningful Urdu (title-based), not empty
- [ ] Internal links: related / same-category news (3–5)
- [ ] Category landing pages SEO titles (“پاکستان خبریں”, “ٹیک خبریں”, …)
- [ ] Author / publisher entity consistency (Nexora News Urdu)
- [ ] Optional bot field: dedicated `meta_description` agar summary kabhi bohot chhoti/lambi ho
- [ ] Avoid thin pages: skip / noindex agar article body bohot short ho

**Done criteria:** Category + article templates on-page checklist pass; related-news module live.

---

## Phase 15 — Measurement & Growth Loop — 🟡 Medium

- [ ] Search Console: queries, pages, CTR — haftawar review
- [ ] Analytics: article views (Phase 8 `views` — website pe increment confirm)
- [ ] Top pages vs zero-impression pages → title/meta tweak
- [ ] Facebook → website click-through (UTM: `?utm_source=facebook&utm_medium=social`)
- [ ] Index coverage errors fix queue (soft-404, redirected, excluded)

**Done criteria:** Weekly SEO snapshot possible (impressions, clicks, top 10 URLs); UTM se social traffic alag dikhe.

---

## Suggested Order (Wave 2)

1. **Phase 10** — Meta + OG (sabse tez win)  
2. **Phase 11** — Sitemap + robots + Search Console  
3. **Phase 12** — Slugs + JSON-LD  
4. **Phase 13** — Rendering / static HTML (crawl reliability)  
5. **Phase 14** — On-page + internal links  
6. **Phase 15** — Measure + iterate  

**Rule:** Pehle indexable + shareable banao, phir pretty URLs, phir deep content polish.

---

## Progress Tracking — Wave 2

| Phase | Focus | Priority | Status |
|---|---|---|---|
| Phase 10 — SEO Foundation (meta / OG) | Website | 🔴 Critical | 🟡 Helpers in bot repo; wire on live site |
| Phase 11 — Sitemap + robots + GSC | Website / ops | 🔴 Critical | ⬜ Not started |
| Phase 12 — Slugs + JSON-LD | Bot + website | 🟠 High | ⬜ Not started |
| Phase 13 — Crawlability / rendering | Website | 🟠 High | ⬜ Not started |
| Phase 14 — On-page + internal links | Website (+ optional bot) | 🟡 Medium | ⬜ Not started |
| Phase 15 — Measurement & growth | Ops | 🟡 Medium | ⬜ Not started |

### Wave 2 — pehle se ready (bot side)

| Item | Status |
|---|---|
| AI `seo_title` | ✅ Generated |
| `urdu_summary` (meta description candidate) | ✅ |
| Category + hashtags | ✅ |
| Article image for `og:image` | ✅ (when cover/stock exists) |
| Website article link on Facebook | ✅ (`WEBSITE_BASE_URL`) |
| Pretty `slug` column | ❌ Not yet |
| Auto `sitemap.xml` | ❌ Not yet |
| JSON-LD helpers | ❌ Not yet |

---

## Docs already in repo

- `DATABASE_SCHEMA.md`, `ARCHITECTURE.md`, `BOT_ARCHITECTURE.md`, `AI_PIPELINE.md`, `website-integration/README.md`, etc.

Wave 2 ke baad useful add-ons: `SEO_CHECKLIST.md` (per-article QA), Search Console runbook.
