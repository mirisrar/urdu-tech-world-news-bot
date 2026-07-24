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

## Phase 2 — Multi-Source News Collection — 🟠 High

- [ ] RSS sources ko config array mein rakho (BBC, Reuters, Dawn, Geo, ARY, Al Jazeera, etc.) — hardcoded single URL hatao.
- [ ] Har source ke liye `source` field DB mein already hai — sirf loop se sab feeds process karo.
- [ ] Category-wise source mapping (Tech, World, Business, Sports) agar niche-specific audience chahiye.
- [ ] Gemini calls ke beech rate-limiting/throttling (free-tier quota se bachne ke liye).

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

## Progress Tracking / Completion Estimate

Har phase ko project ke overall scope ka ek weight diya gaya hai (bara/critical phases zyada weight, chhote/low-priority phases kam weight) — taake "kitna % complete hai" ka ek meaningful (sirf "9 mein se 2 phase" jaisa naive count nahi) answer mil sake.

| Phase | Weight | Status |
|---|---|---|
| Phase 0 — Foundation (MVP pipeline) | 5% | ✅ Done |
| Phase 1 — Stability & Bug Fixes (+ Gemini migration) | 10% | ✅ Done |
| Phase 2 — Multi-Source Collection | 10% | ⏳ Next |
| Phase 3 — AI Processing Pipeline (structured JSON, SEO title) | 15% | ❌ Not started |
| Phase 4 — Social Media Publishing Layer | 20% | ❌ Not started |
| Phase 5 — Image Pipeline | 10% | ❌ Not started |
| Phase 6 — Website Integration | 15% | ❌ Not started |
| Phase 7 — Admin Dashboard | 8% | ❌ Not started |
| Phase 8 — Monitoring & Analytics | 4% | ❌ Not started |
| Phase 9 — Scalability & Optimization | 3% | ❌ Not started |
| **Total** | **100%** | |

**Abhi tak (Phase 0 + Phase 1 done)**: **15% complete**.

**Phase 2 complete hone ke baad**: **25% complete** (5% + 10% + 10%).

### Yeh weights kyun aise hain?

- **Phase 4 (Publishing) sabse bara weight (20%)** — 4 alag channels (Facebook, Telegram, WhatsApp, X), har ek apna auth/API/idempotency logic chahta hai — sabse zyada implementation surface area.
- **Phase 3 (AI Pipeline) aur Phase 6 (Website) 15% each** — dono critical/high priority hain aur substantial kaam hain (structured AI output + validation; full website ya integration layer).
- **Phase 7-9 (Dashboard, Monitoring, Scale) kam weight** — valuable hain but project ke "core value" (news collect → translate → publish) ke baghair bhi system chal sakta hai; yeh polish/maturity phases hain.
- Yeh weights **estimates hain, exact science nahi** — jaise-jaise actual implementation ka scope clear hota jaye (especially Phase 6's "existing vs. naya website" open question), inko revise karna theek hai.

### Kaise update karein

Jab bhi koi phase complete ho, is table mein status update karo aur cumulative % recalculate karo — taake yeh roadmap hamesha ek accurate "hum kahan hain" snapshot de.

---

## Future Documents (agle steps ke baad banayenge)

- Bot Architecture Document
- Database Design Document
- API Flow Document
- Development Roadmap (detailed sprint-level breakdown)
- Project Constitution
