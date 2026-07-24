# Project Overview

## Naam
**Urdu Tech & World News Bot** (repo: `urdu-tech-world-news-bot`)

## Kya hai yeh project?

Yeh ek automated news aggregation aur AI content pipeline hai jo:

1. Dunya bhar ke news sources (RSS feeds) se latest headlines collect karta hai.
2. Har headline ko AI (Google Gemini LLM) se process karta hai — Urdu translation, summary, category, hashtags, aur Facebook-ready post generate karta hai.
3. Processed content ko database (Supabase) mein store karta hai.
4. Aage jaake (roadmap ke mutabiq) yeh content automatically website (Nexora News Urdu) aur social media channels (Facebook, Telegram, WhatsApp, X) par publish karega.

## Problem jo yeh solve karta hai

- Urdu-speaking audience ke liye English/international news manually translate karke publish karna time-consuming hai.
- Ek single person/team se multiple sources, multiple channels manage karna scale nahi karta.
- Yeh bot pura process (collect → translate → summarize → categorize → publish) automate kar deta hai, minimal human intervention ke saath.

## Target Audience

- Urdu-speaking news consumers (Pakistan aur diaspora) jo tech aur world news mein interested hain.
- Website visitors (Nexora News Urdu) aur social media followers (Facebook/Telegram/WhatsApp/X).

## Current Status (jaisa `PROJECT_ROADMAP.md` mein detail hai)

| Component | Status |
|---|---|
| RSS collection (single source: BBC) | ✅ Working (multi-item per run) |
| AI processing (Gemini, Urdu translation/summary) | ✅ Working (validated, retried on failure; JSON-structured output still pending — Phase 3) |
| Database storage (Supabase) | ✅ Working |
| Automation (GitHub Actions cron, hourly) | ✅ Working |
| Duplicate prevention | ✅ Fixed (Phase 1) |
| Multi-item processing per run | ✅ Fixed (Phase 1) |
| Multi-source collection | ❌ Not yet (Phase 2) |
| Website publishing | ❌ Not yet |
| Social media publishing (Facebook/Telegram/WhatsApp/X) | ❌ Not yet |
| Image pipeline (permanent storage) | ❌ Not yet |
| Admin dashboard | ❌ Not yet |
| Monitoring/analytics | ❌ Not yet |

## Core Goals (Priority Order)

1. **Reliability** — bot bina crash/duplicate ke consistently chale.
2. **Coverage** — multiple trusted sources se news collect kare.
3. **Quality AI output** — accurate Urdu translation, sahi category, SEO-friendly title.
4. **Distribution** — processed content automatically website aur social channels par pohanche.
5. **Manageability** — admin dashboard se non-technical user bhi bot control kar sake.
6. **Observability & Scale** — health monitoring, analytics, aur growth ke liye architecture ready ho.

## Related Documents

- [`PROJECT_ROADMAP.md`](./PROJECT_ROADMAP.md) — Phased execution plan
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — System design
- [`BOT_ARCHITECTURE.md`](./BOT_ARCHITECTURE.md) — Bot pipeline internals
- [`AI_PIPELINE.md`](./AI_PIPELINE.md) — AI prompt/processing design
- [`DATABASE_SCHEMA.md`](./DATABASE_SCHEMA.md) — Supabase schema
- [`TECH_STACK.md`](./TECH_STACK.md) — Technologies used/planned
