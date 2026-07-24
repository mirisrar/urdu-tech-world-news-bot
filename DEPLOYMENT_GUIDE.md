# Deployment Guide

## 1. Current Deployment (Bot Automation)

Yeh project currently ek **serverless-style deployment** use kar raha hai — koi dedicated server/host nahi, sirf GitHub Actions:

### How it works

- `.github/workflows/news.yml` GitHub Actions par `main` branch ke against configured hai.
- Trigger: hourly cron (`0 * * * *`) + manual `workflow_dispatch`.
- Har run: fresh Ubuntu runner spin hoti hai → Node 22 setup → `npm install` → `node index.js` → runner destroy.
- No persistent server, no uptime cost — GitHub Actions free tier (public repos) is sufficient at current scale.

### Setup Steps (for a new environment/fork)

1. **Supabase project banao** (supabase.com) — `news` table create karo (see `DATABASE_SCHEMA.md`).
2. **Gemini API key** generate karo (aistudio.google.com → "Get API key").
3. GitHub repo Settings → Secrets and variables → Actions mein add karo:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY`
4. Workflow already configured hai — push karne par ya schedule par automatically chalega. Manual test: Actions tab → "News Bot" → "Run workflow".

> **Migration note**: yeh project pehle Groq use karta tha, ab Gemini par migrate ho gaya hai (see `AI_PIPELINE.md` §"Why Gemini"). Agar aapke repo mein purana `GROQ_API_KEY` secret already set hai, usay `GEMINI_API_KEY` se replace/add karo — workflow ab isay use karta hai, `GROQ_API_KEY` ab redundant hai.

## 2. Scaling Considerations (as sources/frequency grow — Phase 2, 9)

- GitHub Actions free tier limits (2,000 minutes/month for private repos; unlimited for public repos, but with concurrency limits) — monitor usage agar frequency/sources badhein.
- Agar zyada frequent runs (e.g. every 5 minutes) ya heavy processing chahiye ho, consider migrating to a dedicated worker (e.g. small VM, Railway, Render) — GitHub Actions cron minimum granularity bhi 5 minutes hai aur schedule delays ho sakti hain under load.

## 3. Future Deployment — Website (Phase 6)

Depends on the open question in `PROJECT_ROADMAP.md`: existing Nexora News Urdu site vs. new build.

**Agar naya build hai** (recommended stack: Next.js + Supabase):

- Deploy target: **Vercel** (free tier, native Next.js support, easy env var management) ya Netlify.
- Environment variables needed: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public/anon key, safe for client since RLS controls access).
- CI: Vercel auto-deploys on push to `main` (preview deployments on PRs) — no extra GitHub Actions config typically needed.

**Agar existing site hai**:

- Integration approach TBD — likely a webhook/API call from this bot to the existing site's CMS/API after processing, or the existing site polls Supabase directly.

## 4. Future Deployment — Admin Dashboard (Phase 7)

- If built as a separate app: same hosting approach as website (Vercel/Netlify), but likely behind authentication (Supabase Auth) and possibly a separate subdomain (e.g. `admin.nexoranewsurdu.com`).
- If built as routes within the website app: shared deployment, gated by auth middleware.

## 5. Rollback Strategy

- Bot automation: since it's stateless (each run is independent), rollback = revert the `main` branch commit; next scheduled run uses the reverted code automatically. No manual "undo" of a bad automation run needed beyond fixing bad DB rows if any were inserted.
- Website/Dashboard (future): use hosting platform's built-in rollback (Vercel/Netlify keep previous deployments one click away).

## 6. Monitoring Deployment Health (ties into Phase 8)

- Currently: GitHub Actions run history (Actions tab) is the only visibility into success/failure.
- Recommended: add a notification step (e.g. Slack/Telegram/email webhook) on workflow failure, so failures aren't only discovered by manually checking Actions tab.
