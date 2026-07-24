# Tech Stack

## Currently Used

| Layer | Technology | Purpose |
|---|---|---|
| Runtime | Node.js (v22, ES Modules) | Script execution |
| RSS Parsing | [`rss-parser`](https://www.npmjs.com/package/rss-parser) | News feeds parse karna |
| Database | [Supabase](https://supabase.com) (Postgres + JS client `@supabase/supabase-js`) | News data storage |
| AI / LLM | [Google Gemini API](https://ai.google.dev) — model `gemini-3.5-flash-lite` | Urdu translation, summary, categorization, post generation |
| Image Generation | [Pollinations.ai](https://pollinations.ai) (on-the-fly image URL) | AI image prompt se image URL |
| Automation / Scheduler | GitHub Actions (`cron`, hourly) | Bot ko automatically trigger karna |
| Source Control / CI | GitHub | Code hosting, Actions workflow |

## Planned Additions (Roadmap ke phases ke mutabiq)

| Phase | Technology (proposed) | Purpose |
|---|---|---|
| Phase 2 | Multiple RSS feed configs (no new tech, config-driven) | Multi-source collection |
| Phase 3 | Structured output / JSON mode (Gemini `responseMimeType: "application/json"`) | Reliable AI parsing |
| Phase 4 | Facebook Graph API, Telegram Bot API, WhatsApp Business API, X (Twitter) API v2 | Social publishing |
| Phase 5 | Supabase Storage (or Cloudinary/S3) + image optimization lib (e.g. `sharp`) | Permanent, optimized images |
| Phase 6 | Next.js (React) — assuming website build-out; or REST/webhook if integrating with existing Nexora News Urdu site | Website integration |
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
- Website (Phase 6): Vercel/Netlify (if built in-house) — TBD based on Nexora News Urdu integration decision
- Admin dashboard (Phase 7): Same hosting as website, or separate internal deployment
