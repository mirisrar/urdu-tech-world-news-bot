# Security Guidelines

## 1. Secrets Management

- **Never hardcode** API keys/tokens in source code. Current codebase correctly uses `process.env.*` for `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GROQ_API_KEY` — maintain this pattern for all future secrets (Facebook, Telegram, WhatsApp, X tokens).
- Secrets live in **GitHub Actions Secrets** (production) and local `.env` (development, never committed — ensure `.gitignore` includes `.env`).
- **Rotate keys periodically**, especially if a key was ever accidentally exposed in logs or a commit.

### ⚠️ Immediate Action Item

The current `index.js` logs `GROQ_API_KEY?.length` and dumps the full raw Groq API response to console (`console.log(JSON.stringify(data, null, 2))`). While this doesn't leak the key value itself, it's a bad habit that risks leaking sensitive data in logs — **remove debug logging like this before it grows to include actually sensitive fields** (this is called out in `PROJECT_ROADMAP.md` Phase 1 and `CODING_STANDARDS.md` §5).

## 2. Supabase / Database Security

- Currently using `SUPABASE_ANON_KEY` (anon/public key), which relies entirely on **Row Level Security (RLS) policies** to restrict access. Confirm RLS is enabled on the `news` table with appropriate policies:
  - Public **read** access may be fine (e.g. if the website will read directly via anon key).
  - **Write/insert** access should be restricted — ideally the bot uses a more privileged key (e.g. `service_role`, kept server-side/in Actions secrets only, never exposed to any frontend) rather than the anon key, once a website/dashboard is added.
- Add a **unique constraint on `url`** at the DB level (defense in depth beyond application-level duplicate checks — see `DATABASE_SCHEMA.md`).
- Never expose `SUPABASE_SERVICE_ROLE_KEY` (if adopted later) to any client-side/browser code — only server-side (Actions, API routes).

## 3. Third-Party API Keys (Future — Phase 4)

As Facebook/Telegram/WhatsApp/X integrations are added:

- Use **least-privilege tokens** (e.g. Facebook Page access token scoped only to posting permissions, not full account access).
- Store per-platform tokens as separate secrets, documented in `API_DOCUMENTATION.md` §4.
- Be aware of token expiry (e.g. Facebook long-lived tokens still expire ~60 days) — plan for rotation/refresh, and alert (Phase 8) if a publish fails due to an expired token.

## 4. AI-Generated Content Risks

- AI output is currently **trusted and inserted directly** without validation or moderation. Risks:
  - **Prompt injection via headline content** — a malicious/crafted headline could theoretically manipulate the AI's output format or content. Low risk currently (source is a reputable RSS feed), but increases as more sources (Phase 2) are added, especially if any less-curated sources are considered.
  - **Hallucinated/inaccurate translations** — no fact-checking layer exists. For a news product, inaccurate Urdu summaries are a reputational risk.
- **Mitigations** (align with `AI_PIPELINE.md` Phase 3 plans):
  - Schema-validate AI output before use.
  - Consider a lightweight moderation/sanity check before auto-publishing (especially before Phase 4 social auto-publish goes live) — e.g. flag items for manual review if confidence is low, rather than fully autonomous publishing from day one.

## 5. Dependency Security

- Run `npm audit` periodically (or enable Dependabot / GitHub's built-in dependency alerts) to catch vulnerable dependencies.
- Keep `rss-parser` and `@supabase/supabase-js` updated to patched versions.

## 6. GitHub Actions Security

- Only add secrets that are actually needed; don't over-provision workflow permissions.
- Be cautious with `workflow_dispatch` — since manual runs bypass schedule, ensure only trusted collaborators have write access to trigger it in a way that could spend API quota or spam publish (relevant once Phase 4 auto-publishing exists).
- Pin action versions (e.g. `actions/checkout@v4`) rather than using `@master`/`@latest`, to avoid unexpected behavior from upstream action changes.

## 7. Future Auth (Phase 7 — Admin Dashboard)

- Use Supabase Auth (or equivalent) rather than building custom auth from scratch.
- Enforce role-based access (admin vs. viewer) if multiple people will use the dashboard.
- Rate-limit/lock sensitive actions (e.g. bulk delete, source management) behind confirmation + audit logging.

## 8. Incident Response (Basic Plan)

- If a key is leaked: rotate immediately (Supabase/Groq/social platform dashboards), then invalidate the old key.
- If bad content gets published: have a documented manual "unpublish" path (even if just a direct DB update initially, until Phase 7 dashboard exists) to remove it from website/social channels quickly.
