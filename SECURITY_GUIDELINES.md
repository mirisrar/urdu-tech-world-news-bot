# Security Guidelines

## 1. Secrets Management

- **Never hardcode** API keys/tokens in source code. Current codebase correctly uses `process.env.*` for `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GEMINI_API_KEY`, `NEWS_API_KEY`, and all Phase 4 publisher credentials (Facebook, Telegram, X, WhatsApp) — maintain this pattern for any future secrets too.
- Secrets live in **GitHub Actions Secrets** (production) and local `.env` (development, never committed — ensure `.gitignore` includes `.env`).
- **Rotate keys periodically**, especially if a key was ever accidentally exposed in logs or a commit.
- **Migration note**: this project switched its AI provider from Groq to Gemini. The old `GROQ_API_KEY` GitHub Actions secret is no longer used by `news.yml` and can be removed; a new `GEMINI_API_KEY` secret must be added before the workflow will run successfully (see `DEPLOYMENT_GUIDE.md`).

### ✅ Resolved (Phase 1)

The current `index.js` previously logged `GROQ_API_KEY?.length` and dumped the full raw AI API response to console (`console.log(JSON.stringify(data, null, 2))`). While this didn't leak the key value itself, it was a bad habit that risked leaking sensitive data in logs. This has been **fixed** — debug dumps were removed and replaced with structured logging (see `PROJECT_ROADMAP.md` Phase 1 and `CODING_STANDARDS.md` §5). This discipline was maintained through Phase 4 — `publishAndRecord()`'s logging reports per-channel success/failure status only, never token values.

## 2. Supabase / Database Security (Phase 6 — now critical, not just theoretical)

**This is no longer a "someday" concern — it's active as of Phase 6.** The website (Nexora News Urdu) reads `news` directly from the browser using the Supabase JS SDK + `SUPABASE_ANON_KEY`, which makes that key **effectively public** (visible to any visitor via browser dev tools/network tab).

- **Row Level Security MUST restrict the `anon` role to read-only** on `news` — see `website-integration/database/rls-policy.sql` / `DATABASE_SCHEMA.md`. Without this, anyone could use the (now-public) anon key to insert/update/delete rows from their browser console.
- **Admin CMS writes use the `authenticated` role** (Supabase Auth session) — RLS grants SELECT/INSERT/UPDATE/DELETE on `news` and upload on `news-images` to `authenticated` only. Admin login **must** establish a real Supabase Auth JWT; a custom localStorage password gate that still talks to Supabase with the bare anon key will lose write access after these policies are applied.
- **The bot itself must use `SUPABASE_SERVICE_ROLE_KEY`** (bypasses RLS entirely) for its own writes, not the anon key — `index.js` already prefers this key (with an anon-key fallback + warning for anyone who hasn't migrated). `SUPABASE_SERVICE_ROLE_KEY` must **only** ever live in server-side secrets (GitHub Actions) — **never** in the website's code, Admin `config.js`, or any client-side/browser context.
- **Setup order matters**: (1) `SUPABASE_SERVICE_ROLE_KEY` in GitHub Actions, (2) Admin on Supabase Auth, (3) `schema-align.sql`, (4) `rls-policy.sql`. Applying anon-read-only RLS before the service-role secret breaks the bot; applying it before Admin Auth breaks Admin edit/save/delete.
- Add a **partial unique index on `url`** (`WHERE url IS NOT NULL`) — see `schema-align.sql`. Admin manual posts may leave `url` null; bot RSS items always set it.
- **Storage bucket (`news-images`)**: public **reads**; **writes** only via `authenticated` (Admin) or `service_role` (bot). Do not leave the bucket open to public/anon uploads.

## 3. Third-Party API Keys (Phase 4 — done)

Facebook/Telegram/X/WhatsApp are now wired in (`publishers/`). Guidelines to follow as real tokens are added:

- **Least-privilege tokens**: e.g. the Facebook Page access token only needs `pages_manage_posts`/`pages_read_engagement`, not full account access. The X keys are a dedicated Consumer Key/Secret + Access Token/Secret pair for the posting account, not a personal-use token with broader scope.
- **Per-platform secrets, never shared**: each channel's credentials are separate env vars (`FACEBOOK_PAGE_ACCESS_TOKEN`, `TELEGRAM_BOT_TOKEN`, `X_API_KEY`/`X_API_SECRET`/`X_ACCESS_TOKEN`/`X_ACCESS_TOKEN_SECRET`, `WHATSAPP_ACCESS_TOKEN`) — documented in `API_DOCUMENTATION.md` §4.
- **Token expiry**: Facebook long-lived Page tokens still expire (~60 days) and WhatsApp Cloud API tokens can be short- or long-lived depending on setup — plan for rotation/refresh, and add alerting (Phase 8) if a publish fails due to an expired token so it's noticed quickly rather than silently degrading.
- **WhatsApp specifically**: `WHATSAPP_RECIPIENT_NUMBERS` contains real phone numbers — treat this as sensitive data too (not just the token), don't log full numbers in cleartext in shared logs, and ensure every recipient has actually opted in per Meta's policy (sending to non-opted-in numbers risks the WhatsApp Business account being restricted).
- **X OAuth1.0a signing** (`publishers/x.js`) is implemented manually — the signing key is derived from `X_API_SECRET` + `X_ACCESS_TOKEN_SECRET`; never log the computed `Authorization` header (it contains the signature, though not the secrets directly, still avoid logging it as a matter of hygiene).
- Each publisher is independently optional (skipped if unconfigured) — you do **not** need to configure all four channels; add credentials for only the platforms you actually intend to use.

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

## 7. Admin Auth (Phase 7 — Nexora CMS, done)

- Admin UI already exists on the website (`admin/dashboard.html`, `news.html`, `add-news.html`).
- **Required**: Supabase Auth for Admin sessions so RLS `authenticated` policies apply. Do not put `service_role` in the browser.
- Create at least one Auth user in Supabase dashboard for Admin login.
- Optional later: role-based access (admin vs. viewer), audit logging, confirmation already exists on delete in `news.js`.

## 8. Incident Response (Basic Plan)

- If a key is leaked: rotate immediately (Supabase/Google AI Studio/social platform dashboards), then invalidate the old key.
- If bad content gets published: use Admin CMS → News → Delete (or Edit), or a direct DB update as fallback.
