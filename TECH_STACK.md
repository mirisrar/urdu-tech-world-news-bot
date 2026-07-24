# Tech Stack

## Currently Used

| Layer | Technology | Purpose |
|---|---|---|
| Runtime | Node.js (v22, ES Modules) | Script execution |
| RSS Parsing | [`rss-parser`](https://www.npmjs.com/package/rss-parser) | News feeds parse karna (5 sources — BBC, Al Jazeera, Dawn, Geo News, ARY News) |
| News Aggregation (optional) | [NewsAPI.org](https://newsapi.org) (`newsapi.js`) | Keyword-based news search (e.g. `"technology"`) as an additional source; skipped if `NEWS_API_KEY` unset |
| Database | [Supabase](https://supabase.com) (Postgres + JS client `@supabase/supabase-js`) | News data storage |
| AI / LLM | [Google Gemini API](https://ai.google.dev) — model `gemini-3.5-flash-lite` | Urdu translation, summary, categorization, post generation |
| Image Generation | [Pollinations.ai](https://pollinations.ai) (source image) | AI image prompt se image generate karna |
| Image Processing (Phase 5) | [`sharp`](https://sharp.pixelplumbing.com) | Resize (1200x630) + re-encode (WebP, quality 80) |
| Image Storage (Phase 5) | Supabase Storage | Permanent, publicly-accessible image hosting |
| Social Publishing (Phase 4) | Facebook Graph API, Telegram Bot API, X (Twitter) API v2 (OAuth1.0a), WhatsApp Business Cloud API | `publishers/` module — har channel optional, skipped agar configured na ho |
| Automation / Scheduler | GitHub Actions (`cron`, hourly) | Bot ko automatically trigger karna |
| Source Control / CI | GitHub | Code hosting, Actions workflow |

## Planned Additions (Roadmap ke phases ke mutabiq)

| Phase | Technology (proposed) | Purpose |
|---|---|---|
| Phase 2 | ✅ Done — multiple RSS feed configs (no new tech, config-driven) | Multi-source collection |
| Phase 3 | ✅ Done — structured output / JSON mode (Gemini `responseMimeType: "application/json"`) | Reliable AI parsing |
| Phase 4 | ✅ Done — Facebook Graph API, Telegram Bot API, WhatsApp Business Cloud API, X (Twitter) API v2 (manual OAuth1.0a via `node:crypto`) | Social publishing |
| Phase 5 | ✅ Done — Supabase Storage + `sharp` for optimization | Permanent, optimized images |
| Phase 6 | Direct Supabase client read from the existing Nexora News Urdu site (preferred, no bot-side code needed), or a `publishers/website.js` webhook if the site needs a push-based rebuild trigger — depends on the site's tech stack (not yet known — see `PROJECT_ROADMAP.md` Phase 6) | Website integration |
| Phase 7 | Admin dashboard framework — Next.js + Supabase Auth, or a lightweight admin panel (e.g. Retool/custom) | Bot/RSS/settings management |
| Phase 8 | Logging/monitoring — e.g. Sentry (errors), simple custom analytics tables in Supabase | Health & performance visibility |
| Phase 9 | Queue system (e.g. BullMQ + Redis, or Supabase Edge Functions/queues) | Scalability |

## Why these choices?

- **Node.js + ES Modules**: Lightweight, matches existing `package.json` (`"type": "module"`), good ecosystem for RSS/HTTP/AI SDKs.
- **Supabase**: Free-tier friendly Postgres with built-in REST/Realtime/Storage/Auth — good fit for a project that will need Database + Storage + (later) Auth for a dashboard, all under one platform.
- **Gemini (`gemini-3.5-flash-lite`)**: Google's recommended model for high-volume extraction/classification/translation tasks — fast and cost-effective for hourly/frequent automation, strong multilingual (incl. Urdu) support, and a plausible path to consolidating with Google's image generation for Phase 5. See `AI_PIPELINE.md` ("Why Gemini") for full reasoning, including why an earlier Gemini attempt in this project's history didn't stick and what's different now.
- **GitHub Actions**: Free scheduler for a project already hosted on GitHub — no need for a separate server just to run cron jobs at current scale.

## Testing & Tooling (proposed, see `TESTING_GUIDE.md`)

- Test runner: `vitest` or `node:test` (lightweight, ESM-native)
- Linting: ESLint (recommended config) + Prettier
- Environment management: `dotenv` for local development

## Deployment Targets (proposed, see `DEPLOYMENT_GUIDE.md`)

- Bot automation: GitHub Actions (current, no change needed for Phase 1-3)
- Website (Phase 6): Nexora News Urdu is already deployed independently (existing site — hosting/platform not yet known to this bot's team)
- Admin dashboard (Phase 7): Same hosting as website, or separate internal deployment
