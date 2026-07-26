# API Documentation

Yeh project abhi ek script hai — koi khud ka public/REST API expose nahi karta. Yeh document (a) **external APIs jo bot consume karta hai**, aur (b) **future internal APIs** jo dashboard/website integration ke liye plan hain, dono cover karta hai.

## 1. External APIs (Currently Used)

### 1.1 RSS Feeds (multi-source, Phase 2)

- **Endpoints** (configured in the `SOURCES` array in `index.js`):
  - BBC — `https://feeds.bbci.co.uk/news/rss.xml`
  - Al Jazeera — `https://www.aljazeera.com/xml/rss/all.xml`
  - Dawn — `https://www.dawn.com/feeds/home`
  - Geo News — `https://www.geo.tv/rss/1/1`
  - ARY News — `https://arynews.tv/feed/` (redirects to `/feed`; followed transparently)
- **Method**: GET (via `rss-parser`'s `parseURL`)
- **Auth**: None
- **Usage**: `parser.parseURL(url)` returns `feed.items[]`, each with `title`, `link`, etc. `collectItems()` calls this once per configured source, independently (a failure on one source doesn't block the others).
- **Reuters excluded**: their public RSS feeds were discontinued around 2020; candidate URLs were verified to 404/return non-RSS content. See `PROJECT_ROADMAP.md` Phase 2.

### 1.1b NewsAPI.org (optional additional source)

- **Client**: `newsapi.js` — `fetchNewsFromNewsApi(query, options)`.
- **Endpoint**: `https://newsapi.org/v2/everything` (default) or `https://newsapi.org/v2/top-headlines` (`options.endpoint`).
- **Auth**: `X-Api-Key: <NEWS_API_KEY>` header.
- **Method**: `GET`, query params `q`, `pageSize`, and (for `/everything`) `language`/`sortBy`.
- **Usage in the bot**: `collectNewsApiItems()` calls this once per configured query (`NEWS_API_QUERIES` in `index.js`, default `["technology"]`) and adapts each returned article (`{title, description, url, urlToImage}`) to the `{title, link}` shape the rest of the pipeline expects.
- **Optional by design**: if `NEWS_API_KEY` isn't set, this source is skipped with an info log — not an error. Nothing else in the bot depends on it.
- **Error handling**: distinguishes network failures from NewsAPI's own error responses (`{status:"error", code, message}` with a non-2xx HTTP status, e.g. `apiKeyInvalid`, `apiKeyMissing`, rate limiting) — see `newsapi.js` for details.

### 1.2 Gemini API (`generateContent`)

- **Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent`
- **Method**: `POST`
- **Auth**: `x-goog-api-key: <GEMINI_API_KEY>` header
- **Model**: `gemini-3.5-flash-lite` (see `AI_PIPELINE.md` §"Why Gemini" for why this model/provider was chosen — this project previously used Gemini, moved to Groq, and has now moved back to Gemini)
- **Request body** (current, Phase 3 — structured output):

```json
{
  "contents": [
    { "parts": [{ "text": "<prompt with headline>" }] }
  ],
  "generationConfig": {
    "responseMimeType": "application/json",
    "responseSchema": { "...": "see RESPONSE_SCHEMA in index.js" }
  }
}
```

  No `temperature`/`top_p`/`top_k` override is sent — Google recommends keeping default sampling parameters for Gemini 3.x models. `responseSchema` (Phase 3) constrains Gemini to return JSON matching an explicit shape (`category`, `urduTitle`, `urduSummary`, `seoTitle`, `article`, `hashtags[]`, `facebookPost`, `imagePrompt`).

- **Response**: content extracted via `data.candidates[0].content.parts[0].text` — now a JSON string (parsed with `JSON.parse`) rather than free-text. If the request was safety-filtered, `data.promptFeedback.blockReason` is set instead of a candidate — the bot treats this as an error (see `index.js`).
- **Output format**: structured JSON (Phase 3, see `AI_PIPELINE.md` for the full schema and how it was verified against the real API without a valid key). The old free-text/regex-parsed format has been fully replaced.

### 1.3 Supabase (Postgres REST via `@supabase/supabase-js`)

- **Client init**: `createClient(SUPABASE_URL, SUPABASE_ANON_KEY)`
- **Calls used today**:
  - `supabase.from("news").select("url").eq("url", item.link)` — duplicate check
  - `supabase.from("news").insert({ ... })` — save processed article
- **Auth**: Anonymous key (`SUPABASE_ANON_KEY`) — relies on Supabase Row Level Security (RLS) policies to control access (see `SECURITY_GUIDELINES.md`).

### 1.4 Pollinations.ai (Image Generation)

- **Endpoint pattern**: `https://image.pollinations.ai/prompt/<url-encoded prompt>`
- **Method**: GET — as of Phase 5, the bot **actually downloads** this image (via `imagePipeline.js`) rather than just constructing the URL, so it can optimize and permanently store it.
- **Auth**: None
- **Note**: generation is not instant (~10-20s observed) — this is the main source of added per-item latency in Phase 5.

### 1.4b Supabase Storage (Phase 5 — `imagePipeline.js`)

- **Client**: `supabase.storage.from(SUPABASE_STORAGE_BUCKET).upload(path, buffer, {...})` and `.getPublicUrl(path)` — via the same `@supabase/supabase-js` client used for the `news` table.
- **Bucket**: `SUPABASE_STORAGE_BUCKET` env var, default `news-images`. **Must be created manually** as a public bucket in the Supabase dashboard (see `DATABASE_SCHEMA.md`) — the bot has no permission/mechanism to create it itself.
- **Usage**: uploads the `sharp`-optimized WebP image, then reads back its public URL to store as the article's `image_url`.
- **Error handling**: if the upload fails (e.g. bucket doesn't exist, permissions issue), falls back to the raw Pollinations.ai URL with a clear warning — verified live against a real (but non-existent-bucket) Supabase project.

### 1.5 Facebook Graph API (Phase 4 — `publishers/facebook.js`)

- **Endpoint**: `https://graph.facebook.com/v21.0/{page-id}/photos` (if an image URL is available) or `/{page-id}/feed` (text + link otherwise).
- **Method**: `POST` (form-encoded body via `URLSearchParams`)
- **Auth**: `access_token` param (`FACEBOOK_PAGE_ACCESS_TOKEN`, a Page access token with `pages_manage_posts`)
- **Usage**: called by `publishAll()` after a successful save, with the AI-generated `facebookPost` text and the (currently Pollinations.ai) image URL.
- **Error handling**: Graph API's `{error: {message, code}}` shape parsed and surfaced clearly; verified live against the real API with a fake token (`Invalid OAuth access token`).

### 1.6 Telegram Bot API (Phase 4 — `publishers/telegram.js`)

- **Endpoint**: `https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendPhoto` (if image) or `/sendMessage`.
- **Method**: `POST` (JSON body)
- **Auth**: bot token embedded in the URL path (Telegram's convention).
- **Usage**: bot must be added to the target channel (`TELEGRAM_CHAT_ID`) as an admin with post permission.
- **Error handling**: Telegram's `{ok: false, description}` shape parsed; verified live against the real API with a fake token (401 Unauthorized).

### 1.7 X (Twitter) API v2 (Phase 4 — `publishers/x.js`)

- **Endpoint**: `https://api.twitter.com/2/tweets`
- **Method**: `POST` (JSON body `{text}`)
- **Auth**: **OAuth 1.0a user-context signing** (`Authorization: OAuth ...` header, HMAC-SHA1) — implemented manually via `node:crypto`, since v2 write access requires it (a plain bearer token is app-only/read-only). Requires `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`.
- **Usage**: composes a short post from `urduTitle` + `sourceUrl`, truncated to fit the 280-character limit.
- **Error handling**: verified live against the real API with fake (but well-formed) OAuth1.0a keys — the signed request reached Twitter's server and received a proper `401 Unauthorized` (not a malformed-request rejection), confirming the manual signing implementation produces a structurally valid request.

### 1.8 WhatsApp Business Cloud API (Phase 4 — `publishers/whatsapp.js`)

- **Endpoint**: `https://graph.facebook.com/v21.0/{phone-number-id}/messages`
- **Method**: `POST` (JSON body, `type: "template"`)
- **Auth**: `Authorization: Bearer <WHATSAPP_ACCESS_TOKEN>` header.
- **⚠️ Scope note**: this sends pre-approved **template messages to individual opted-in recipients** (`WHATSAPP_RECIPIENT_NUMBERS`) — it does **not** post to a "WhatsApp Channel" (the public, Telegram-channel-like broadcast feature), which has **no official public API** as of 2026. See `publishers/whatsapp.js` and `PROJECT_ROADMAP.md` Phase 4 for the full explanation of why.
- **Error handling**: verified live against the real API with a fake token (`Invalid OAuth access token`, same Graph API error shape as Facebook, since WhatsApp Cloud API is also under `graph.facebook.com`).

### 1.9 Website Read Access (Phase 6 — `website-integration/`, not called by the bot)

Unlike every other integration in this document, this direction is **inbound, not outbound** — the bot doesn't call the website; the website calls Supabase directly.

- **Client**: Supabase JS SDK (loaded from `esm.sh` CDN — no build step), used by Nexora News Urdu's own vanilla JS code (see `website-integration/newsApi.js` in this repo, meant to be copied into the website's repo).
- **Auth**: `SUPABASE_ANON_KEY`, used client-side (publicly visible in the browser) — safe **only** because Row Level Security restricts the `anon` role to `SELECT` (read-only) on `news`. See `DATABASE_SCHEMA.md`/`SECURITY_GUIDELINES.md`.
- **Queries**: `getHeroNews`, `getBreakingNews`, `getLatestNews` (paginated + category filter), `getTrendingNews`, `getCategories`, `searchNews`, `getArticleById` — see `website-integration/README.md` for full usage.
- **Live updates**: Supabase Realtime (`postgres_changes` on INSERT), via `website-integration/realtime.js` — requires Realtime enabled on the `news` table (Supabase dashboard → Database → Replication).
- **Verified**: every query's actual generated PostgREST REST URL was checked by intercepting `fetch()` calls made by the real `@supabase/supabase-js` package. Not live-tested against a real Supabase project (none was available in the dev environment).

## 2. Planned External APIs (Future Phases)

All previously "planned" external APIs (Facebook, Telegram, X, WhatsApp, Supabase Storage) are now implemented — see §1 above. Nothing currently planned/outstanding at the external-API level; Phase 7+ needs are internal (§3 below).

## 3. Admin CMS API (Phase 7 — done via direct Supabase)

Nexora Admin CMS uses approach **(a)** — direct Supabase JS client + RLS, no custom backend:

| Operation | How | Role |
|---|---|---|
| List / search news | `from("news").select("*")` (`news.js`) | `authenticated` |
| Create news | `from("news").insert(...)` (`add-news.js`) | `authenticated` |
| Update news | `from("news").update(...).eq("id", id)` | `authenticated` |
| Delete news | `from("news").delete().eq("id", id)` | `authenticated` |
| Upload image | `storage.from("news-images").upload(...)` | `authenticated` |

Public website stays on `anon` SELECT-only. Bot stays on `service_role`. See `DATABASE_SCHEMA.md` / `rls-policy.sql`.

Optional later (not required for Phase 7 done): custom routes for RSS source toggles or bot run logs (Phase 8).
| `POST` | `/api/webhooks/publish` | Manually trigger publish for an article | 7 |

> Exact design will be finalized when Phase 6/7 begin — this section is a planning placeholder, not a committed contract yet.

## 4. Environment Variables (Secrets Contract)

| Variable | Used By | Required |
|---|---|---|
| `SUPABASE_URL` | Supabase client | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase client (preferred for bot writes, bypasses RLS) — Phase 6 | Strongly recommended once the website's read-only RLS policy is applied; bot falls back to `SUPABASE_ANON_KEY` otherwise |
| `SUPABASE_ANON_KEY` | Supabase client (fallback for bot; also used client-side by the website — see `website-integration/`) | Yes |
| `GEMINI_API_KEY` | Gemini API auth | Yes |
| `NEWS_API_KEY` | NewsAPI.org auth | No — optional source, skipped if unset |
| `FACEBOOK_PAGE_ID` | Facebook publisher | No — optional channel, skipped if unset |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | Facebook publisher | No — optional channel, skipped if unset |
| `TELEGRAM_BOT_TOKEN` | Telegram publisher | No — optional channel, skipped if unset |
| `TELEGRAM_CHAT_ID` | Telegram publisher | No — optional channel, skipped if unset |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp publisher | No — optional channel, skipped if unset |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp publisher | No — optional channel, skipped if unset |
| `WHATSAPP_TEMPLATE_NAME` | WhatsApp publisher | No — optional channel, skipped if unset |
| `WHATSAPP_RECIPIENT_NUMBERS` | WhatsApp publisher (comma-separated E.164 numbers) | No — optional channel, skipped if unset |
| `X_API_KEY` / `X_API_SECRET` | X publisher (OAuth1.0a consumer key/secret) | No — optional channel, skipped if unset |
| `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` | X publisher (OAuth1.0a access token/secret) | No — optional channel, skipped if unset |
| `SUPABASE_STORAGE_BUCKET` | Image pipeline (bucket name) | No — defaults to `news-images` |
| `DEFAULT_FALLBACK_IMAGE_URL` | Image pipeline (last-resort fallback) | No — falls back to Pollinations.ai URL or empty string if unset |

See `SECURITY_GUIDELINES.md` for how these should be stored/rotated.
