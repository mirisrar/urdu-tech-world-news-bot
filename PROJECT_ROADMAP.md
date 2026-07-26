# Roadmap — Urdu Tech & World News Bot

Yeh roadmap current codebase (RSS fetch → Gemini AI translation/summary → Supabase storage → GitHub Actions cron) ke upar based hai, aur ideal end-to-end flow ke mutabiq 9 phases mein structured hai.

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

## Phase 9 — Scalability & Optimization — 🟢 Low

- [ ] Queue system (jaise BullMQ/Redis) taake multiple items parallel/ordered process ho sakein.
- [ ] Caching layer (repeated AI calls avoid karne ke liye, e.g. similar headlines).
- [ ] Worker-based architecture (collector, AI processor, publisher alag workers ke roop mein).
- [ ] Performance tuning as volume badhay (zyada sources, zyada frequency).

**Done criteria**: System bina performance degradation ke, zyada sources/frequency handle kar sake.

---

## Suggested Order of Execution

1. **Phase 1** — Stability fixes (thoda kaam, sabse zyada leverage).
2. **Phase 3** — AI Processing Pipeline (core feature, structured output baaki sab phases ki foundation hai).
3. **Phase 2** — Multi-source collection (coverage badhana).
4. **Phase 4** — Social Media Publishing (asli distribution value unlock karta hai).
5. **Phase 5** — Image Pipeline (publishing ko polish karta hai).
6. **Phase 6** — Website Integration.
7. **Phase 9** — Admin + analytics + bot alerts done; ab scale/optimization.

---

## Progress Tracking / Completion Estimate

Har phase ko project ke overall scope ka ek weight diya gaya hai (bara/critical phases zyada weight, chhote/low-priority phases kam weight) — taake "kitna % complete hai" ka ek meaningful (sirf "9 mein se 2 phase" jaisa naive count nahi) answer mil sake.

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
| Phase 9 — Scalability & Optimization | 3% | ⏳ Next |
| **Total** | **100%** | |

**Abhi tak (Phase 0 → Phase 8 done)**: **97% complete** (5% + 10% + 10% + 15% + 20% + 10% + 15% + 8% + 4%).

**Phase 9 complete hone ke baad**: **100% complete** (97% + 3%).

**Note**: "Done" yahan **code implemented aur request-format live-verified** ka matlab hai (see Phase 4 status note above) — **real-account success path abhi tak kisi bhi phase ke external integrations (Gemini, NewsAPI, Facebook, Telegram, WhatsApp, X) mein live-verify nahi hua**, kyunke is dev environment mein in platforms ke real credentials available nahi the. Production mein real secrets add karne ke baad, ek manual `workflow_dispatch` run se in sab ko end-to-end confirm karna baaki hai.

### Yeh weights kyun aise hain?

- **Phase 4 (Publishing) sabse bara weight (20%)** — 4 alag channels (Facebook, Telegram, WhatsApp, X), har ek apna auth/API/idempotency logic chahta hai — sabse zyada implementation surface area.
- **Phase 3 (AI Pipeline) aur Phase 6 (Website) 15% each** — dono critical/high priority hain aur substantial kaam hain (structured AI output + validation; full website ya integration layer).
- **Phase 7-9 (Dashboard, Monitoring, Scale) kam weight** — valuable hain but project ke "core value" (news collect → translate → publish) ke baghair bhi system chal sakta hai; yeh polish/maturity phases hain.
- Yeh weights **estimates hain, exact science nahi** — jaise-jaise actual implementation ka scope clear hota jaye, inko revise karna theek hai. (Phase 6's "existing vs. naya website" sawal ab resolve ho chuka hai — existing website hai, sirf integration chahiye — see Phase 6 details.)

### Kaise update karein

Jab bhi koi phase complete ho, is table mein status update karo aur cumulative % recalculate karo — taake yeh roadmap hamesha ek accurate "hum kahan hain" snapshot de.

---

## Future Documents (agle steps ke baad banayenge)

- Bot Architecture Document
- Database Design Document
- API Flow Document
- Development Roadmap (detailed sprint-level breakdown)
- Project Constitution
