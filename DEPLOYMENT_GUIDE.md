# Deployment Guide

## 1. Current Deployment (Bot Automation)

Yeh project currently ek **serverless-style deployment** use kar raha hai — koi dedicated server/host nahi, sirf GitHub Actions:

### How it works

- `.github/workflows/news.yml` GitHub Actions par `main` branch ke against configured hai.
- Trigger: hourly cron (`0 * * * *`) + manual `workflow_dispatch`.
- Har run: fresh Ubuntu runner spin hoti hai → Node 22 setup → `npm install` → `node index.js` → runner destroy.
- No persistent server, no uptime cost — GitHub Actions free tier (public repos) is sufficient at current scale.

### Setup Steps (for a new environment/fork)

1. **Supabase project banao** (supabase.com) — `news` table create karo (see `DATABASE_SCHEMA.md`), aur `seo_title`/publish-status columns ke migrations run karo.
2. **Supabase Storage bucket banao** (Phase 5) — Storage → New bucket → naam `news-images` (ya jo bhi `SUPABASE_STORAGE_BUCKET` mein set karo) → **public** mark karo (see `DATABASE_SCHEMA.md`/`SECURITY_GUIDELINES.md` for read-public-but-restricted-write policy guidance).
3. **Gemini API key** generate karo (aistudio.google.com → "Get API key").
4. GitHub repo Settings → Secrets and variables → Actions mein **required** secrets add karo:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY`
5. (Optional) Extra sources/channels/storage config chahiye to yeh bhi add karo — har ek independently optional hai, agar na add karo to us feature ke bina bot normally kaam karta rahega:
   - `NEWS_API_KEY` (NewsAPI.org source)
   - `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN` (Facebook publishing)
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (Telegram publishing)
   - `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET` (X/Twitter publishing)
   - `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_RECIPIENT_NUMBERS` (WhatsApp publishing — see `AI_PIPELINE.md`/`PROJECT_ROADMAP.md` Phase 4 for the important WhatsApp Channel-vs-template-message scope note)
   - `SUPABASE_STORAGE_BUCKET` (agar step 2 mein default `news-images` ke ilawa koi aur naam use kiya ho), `DEFAULT_FALLBACK_IMAGE_URL` (last-resort image agar generation hi fail ho jaye)
6. Workflow already configured hai — push karne par ya schedule par automatically chalega. Manual test: Actions tab → "News Bot" → "Run workflow".

> **Migration note**: yeh project pehle Groq use karta tha, ab Gemini par migrate ho gaya hai (see `AI_PIPELINE.md` §"Why Gemini"). Agar aapke repo mein purana `GROQ_API_KEY` secret already set hai, usay `GEMINI_API_KEY` se replace/add karo — workflow ab isay use karta hai, `GROQ_API_KEY` ab redundant hai.

> **⚠️ Important**: `news.yml` ka `env:` block ab har upar wale secret ko explicitly list karta hai. Agar aap GitHub Secrets mein koi secret add karte hain lekin `news.yml` ke `env:` block mein uska naam list nahi hai, wo secret `process.env` mein production run mein kabhi available nahi hoga — yeh exact bug already ek baar is project mein mila (`NEWS_API_KEY`/Phase 4 secrets missing thay) aur fix ho gaya hai, lekin future secrets add karte waqt yeh check zaroor karo.

## 2. Scaling Considerations (as sources/frequency grow — Phase 2, 9)

- GitHub Actions free tier limits (2,000 minutes/month for private repos; unlimited for public repos, but with concurrency limits) — monitor usage agar frequency/sources badhein.
- Agar zyada frequent runs (e.g. every 5 minutes) ya heavy processing chahiye ho, consider migrating to a dedicated worker (e.g. small VM, Railway, Render) — GitHub Actions cron minimum granularity bhi 5 minutes hai aur schedule delays ho sakti hain under load.

## 3. Website Integration — Nexora News Urdu (Phase 6)

Nexora News Urdu **already exists and is already deployed** independently of this bot — no new website build/deployment needed by this project. What's needed is connecting it to this bot's data:

- **Preferred**: the website reads directly from Supabase (`SUPABASE_URL` + a public-read anon/RLS policy on the `news` table) from its own frontend/backend code — no deployment change needed on this bot's side at all.
- **Alternative**: if the website needs a push-based trigger (e.g. a static site generator that needs to rebuild when new content appears), this bot would add a `publishers/website.js` webhook call, similar to the Phase 4 social publishers.
- **Still needed to proceed**: the website's tech stack, where its code lives, and (if webhook-based) its trigger endpoint — see `PROJECT_ROADMAP.md` Phase 6.

## 4. Future Deployment — Admin Dashboard (Phase 7)

- If built as a separate app: same hosting approach as website (Vercel/Netlify), but likely behind authentication (Supabase Auth) and possibly a separate subdomain (e.g. `admin.nexoranewsurdu.com`).
- If built as routes within the website app: shared deployment, gated by auth middleware.

## 5. Rollback Strategy

- Bot automation: since it's stateless (each run is independent), rollback = revert the `main` branch commit; next scheduled run uses the reverted code automatically. No manual "undo" of a bad automation run needed beyond fixing bad DB rows if any were inserted.
- Website/Dashboard (future): use hosting platform's built-in rollback (Vercel/Netlify keep previous deployments one click away).

## 6. Monitoring Deployment Health (ties into Phase 8)

- Currently: GitHub Actions run history (Actions tab) is the only visibility into success/failure.
- Recommended: add a notification step (e.g. Slack/Telegram/email webhook) on workflow failure, so failures aren't only discovered by manually checking Actions tab.
