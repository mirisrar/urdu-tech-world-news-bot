# Roadmap — Urdu Tech & World News Bot

Yeh roadmap current codebase (RSS fetch → Groq AI translation/summary → Supabase storage → GitHub Actions cron) ke upar based hai, aur ideal end-to-end flow ke mutabiq 9 phases mein structured hai.

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
- [x] Groq LLM (`llama-3.3-70b-versatile`) se Urdu translation + summary + article + hashtags + Facebook post + image prompt generate karna
- [x] Supabase mein `news` table mein data save karna
- [x] GitHub Actions cron job (har ghante) se automation

---

## Phase 1 — Stability & Bug Fixes — 🔴 Critical

Pehle jo bana hai usay reliable banao, tabhi upar naya kaam karna faida dega.

- [ ] **Duplicate bug fix**: `existing.length > 0` check ke baad `return;` ko actually enable karo (abhi comment out hai).
- [ ] **Multi-item processing**: `feed.items[0]` ki jagah loop lagao (top 5–10 items), taake sirf headline hi baar baar process na ho.
- [ ] **Per-item error isolation**: Ek item fail ho to pura run crash na ho, baaki items continue hon.
- [ ] **Retry logic**: Groq API ya Supabase call fail ho to 1–2 retries with backoff.
- [ ] **Logging cleanup**: Debug dumps (API key length, raw JSON) hata kar structured, concise logs rakho.
- [ ] **AI response validation**: Format match na ho to item skip/log karo, empty strings DB mein save na karo.

**Done criteria**: Bot bina duplicate ya crash ke, multiple fresh news items reliably process kar sake.

---

## Phase 2 — Multi-Source News Collection — 🟠 High

- [ ] RSS sources ko config array mein rakho (BBC, Reuters, Dawn, Geo, ARY, Al Jazeera, etc.) — hardcoded single URL hatao.
- [ ] Har source ke liye `source` field DB mein already hai — sirf loop se sab feeds process karo.
- [ ] Category-wise source mapping (Tech, World, Business, Sports) agar niche-specific audience chahiye.
- [ ] Groq calls ke beech rate-limiting/throttling (free-tier limits se bachne ke liye).

**Done criteria**: Bot 3+ independent sources se news collect kare, bina ek dusre ko block kiye.

---

## Phase 3 — AI Processing Pipeline — 🔴 Critical

Yeh project ka core/differentiating feature hai — isay apna dedicated phase milna chahiye.

- [ ] Urdu translation + summary (already implemented — refine karo).
- [ ] Category classification (already implemented — accuracy improve karo).
- [ ] Hashtag generation.
- [ ] **SEO-friendly title** generate karna (naya — website ke liye zaroori).
- [ ] Image prompt generation (already implemented).
- [ ] AI output ko strict JSON schema mein return karwana (regex parsing ki jagah — reliability ke liye).
- [ ] Prompt versioning/testing — taake future mein prompt improve karna easy ho.

**Done criteria**: Har news item ke liye consistent, structured, validated AI output milay jo Database, Website, aur Social sab consume kar sakein.

---

## Phase 4 — Social Media Publishing Layer — 🟠 High

> **Scope note**: Website yahan include nahi hai — wo Phase 6 mein alag handle hoti hai, taake dono phases overlap na karein.

- [ ] **Facebook Graph API** integration — generated post + image automatically Page par publish karna.
- [ ] **Telegram** channel bot integration.
- [ ] **WhatsApp Business API** integration (agar audience wahan hai).
- [ ] **X/Twitter** posting (short-form version).
- [ ] Publish status tracking DB mein (`published_at`, per-platform post ID columns) taake dobara publish na ho.

**Done criteria**: Naya processed news item bina manual intervention sab configured social channels par live nazar aaye.

---

## Phase 5 — Image Pipeline — 🟡 Medium

- [ ] AI se generated image ko **download** karo aur Supabase Storage (ya CDN) mein permanently upload karo — abhi sirf on-the-fly pollinations.ai URL hai.
- [ ] Image optimize/resize karo (web + social media dimensions ke mutabiq).
- [ ] Fallback/default image agar generation fail ho.
- [ ] Social posts aur website dono same stored image use karein.

**Done criteria**: Har processed news item ke saath ek stable, permanently-hosted, optimized image ho.

---

## Phase 6 — Website Integration (Nexora News Urdu) — 🟠 High

> **Clarify karna hai**: Kya "Nexora News Urdu" ek existing/separate website/repo hai (to yahan sirf API/webhook integration honi hai), ya yeh website isi project ke andar naya banana hai (to yahan pura frontend build karna hoga)? Scope isi decision par depend karta hai.

- [ ] Processed news (Database se) website par automatically show karna.
- [ ] Category filter, search, latest-news homepage.
- [ ] SEO-friendly URLs har article ke liye (Phase 3 ka SEO title yahan use hoga).
- [ ] Website aur social publishing dono same Database record se content lein (duplicate logic avoid karne ke liye).

**Done criteria**: Naya processed news item automatically Nexora News Urdu website par nazar aaye, bina manual publish kiye.

---

## Phase 7 — Admin Dashboard — 🟡 Medium

- [ ] News items manage karna (edit/delete/re-publish).
- [ ] Bots/RSS sources ka on/off toggle aur configuration UI.
- [ ] Settings management (API keys, cron schedule, categories).
- [ ] Logs viewer (run history, errors, success/failure counts).

**Done criteria**: Non-technical admin bina code touch kiye bot ko manage kar sake.

---

## Phase 8 — Monitoring & Analytics — 🟡 Medium

- [ ] Bot health monitoring (run success/fail alerts — email/Telegram).
- [ ] Error tracking aur reporting.
- [ ] Performance metrics (processing time, API latency, cost per run).
- [ ] Engagement analytics (website views, Facebook likes/shares, etc.) DB mein track karna.

**Done criteria**: System ka health aur performance bina manually logs check kiye pata chal sake.

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
7. **Phase 7 → Phase 9** — Jab base automation stable ho jaye, tab admin tooling, monitoring, aur scale par jao.

---

## Future Documents (agle steps ke baad banayenge)

- Bot Architecture Document
- Database Design Document
- API Flow Document
- Development Roadmap (detailed sprint-level breakdown)
- Project Constitution
