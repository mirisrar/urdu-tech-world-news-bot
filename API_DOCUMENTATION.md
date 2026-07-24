# API Documentation

Yeh project abhi ek script hai — koi khud ka public/REST API expose nahi karta. Yeh document (a) **external APIs jo bot consume karta hai**, aur (b) **future internal APIs** jo dashboard/website integration ke liye plan hain, dono cover karta hai.

## 1. External APIs (Currently Used)

### 1.1 RSS Feed (BBC)

- **Endpoint**: `https://feeds.bbci.co.uk/news/rss.xml`
- **Method**: GET (via `rss-parser`'s `parseURL`)
- **Auth**: None
- **Usage**: `parser.parseURL(url)` returns `feed.items[]`, each with `title`, `link`, etc.

### 1.2 Groq Chat Completions API

- **Endpoint**: `https://api.groq.com/openai/v1/chat/completions`
- **Method**: `POST`
- **Auth**: `Authorization: Bearer <GROQ_API_KEY>` header
- **Model**: `llama-3.3-70b-versatile`
- **Request body** (current):

```json
{
  "model": "llama-3.3-70b-versatile",
  "messages": [
    { "role": "user", "content": "<prompt with headline>" }
  ],
  "temperature": 0.7
}
```

- **Response**: Standard OpenAI-compatible chat completion; content extracted via `data.choices[0].message.content`.
- **Output format (current, free-text, regex-parsed)** — see `AI_PIPELINE.md` for full prompt/schema and the planned move to structured JSON output.

### 1.3 Supabase (Postgres REST via `@supabase/supabase-js`)

- **Client init**: `createClient(SUPABASE_URL, SUPABASE_ANON_KEY)`
- **Calls used today**:
  - `supabase.from("news").select("url").eq("url", item.link)` — duplicate check
  - `supabase.from("news").insert({ ... })` — save processed article
- **Auth**: Anonymous key (`SUPABASE_ANON_KEY`) — relies on Supabase Row Level Security (RLS) policies to control access (see `SECURITY_GUIDELINES.md`).

### 1.4 Pollinations.ai (Image Generation)

- **Endpoint pattern**: `https://image.pollinations.ai/prompt/<url-encoded prompt>`
- **Method**: GET (image served on-demand, not called by the bot itself — just constructs the URL and stores it)
- **Auth**: None
- **Limitation**: No guarantee of permanence/availability — see Phase 5 for the planned fix (download + store).

## 2. Planned External APIs (Future Phases)

| API | Phase | Purpose |
|---|---|---|
| Facebook Graph API | 4 | Publish posts + images to a Facebook Page |
| Telegram Bot API | 4 | Send messages to a Telegram channel |
| WhatsApp Business API | 4 | Send messages to a WhatsApp channel/broadcast list |
| X (Twitter) API v2 | 4 | Publish tweets |
| Supabase Storage API | 5 | Upload/store optimized images permanently |

## 3. Planned Internal API (Future — Website/Dashboard Integration)

Once Phase 6 (Website) and Phase 7 (Admin Dashboard) begin, this project will likely need one of:

- **(a) Direct Supabase client access** from the website/dashboard frontend (using Supabase's auto-generated REST/Realtime API + RLS policies) — no custom backend needed.
- **(b) A custom lightweight API layer** (e.g. Next.js API routes) if business logic (e.g. manual publish triggers, admin actions) needs to live server-side rather than directly against the DB.

### Proposed Endpoints (if custom API layer is built)

| Method | Path | Purpose | Phase |
|---|---|---|---|
| `GET` | `/api/news` | List processed news (paginated, filterable by category) | 6 |
| `GET` | `/api/news/:id` | Get single article detail | 6 |
| `POST` | `/api/admin/sources` | Add/update RSS source | 7 |
| `PATCH` | `/api/admin/news/:id` | Edit/unpublish an article | 7 |
| `GET` | `/api/admin/logs` | View bot run logs | 7, 8 |
| `POST` | `/api/webhooks/publish` | Manually trigger publish for an article | 4, 7 |

> Exact design will be finalized when Phase 6/7 begin — this section is a planning placeholder, not a committed contract yet.

## 4. Environment Variables (Secrets Contract)

| Variable | Used By | Required |
|---|---|---|
| `SUPABASE_URL` | Supabase client | Yes |
| `SUPABASE_ANON_KEY` | Supabase client | Yes |
| `GROQ_API_KEY` | Groq API auth | Yes |
| `FACEBOOK_PAGE_TOKEN` (planned) | Facebook publisher | Phase 4 |
| `TELEGRAM_BOT_TOKEN` (planned) | Telegram publisher | Phase 4 |
| `WHATSAPP_API_TOKEN` (planned) | WhatsApp publisher | Phase 4 |
| `X_API_KEY` / `X_API_SECRET` (planned) | X publisher | Phase 4 |

See `SECURITY_GUIDELINES.md` for how these should be stored/rotated.
