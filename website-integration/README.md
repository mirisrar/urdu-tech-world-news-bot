# Nexora News Urdu — Website Integration

Yeh folder **Nexora News Urdu** (HTML5 + CSS3 + Vanilla JS, Vercel-hosted, no framework) ko is bot ke Supabase `news` table se connect karne ke liye modular, production-ready code deta hai. Publishing flow:

```
RSS Sources → News Collector Bot → AI Processor → Supabase Database → Website (yahan) → Social Media Publishers
```

Website **koi webhook receive nahi karti** — yeh khud Supabase se seedha data read karti hai (Supabase JS SDK), naye articles ke liye Realtime subscription bhi available hai (page refresh ke bina).

## Files

| File | Purpose |
|---|---|
| `config.example.js` | Supabase URL/anon key ka template — copy karke `config.js` banao |
| `supabaseClient.js` | Shared Supabase client singleton |
| `newsApi.js` | Sab data-fetching functions (hero, breaking, latest, trending, categories, search, single article) |
| `realtime.js` | Live updates — naya article save hote hi callback fire hota hai |
| `utils.js` | Presentation helpers (relative time, image fallback, excerpt, URL building) |
| `database/rls-policy.sql` | **Zaroori** — Supabase RLS setup jo public read-only access allow kare |
| `examples/homepage-example.html` | Reference: hero + breaking + trending + latest + category filter + realtime, sab wired together |
| `examples/article-example.html` | Reference: single article page |

Sab files **plain ES6 modules** hain, koi build step/bundler nahi chahiye — browser mein direct `<script type="module">` se load hote hain. Supabase JS SDK CDN (`esm.sh`) se import hota hai.

---

## ⚠️ Setup Step 1 — Database Security (SABSE ZAROORI, pehle yeh karo)

Website ka Supabase **anon key** browser mein publicly visible hoga (koi bhi visitor Developer Tools se dekh sakta hai). Yeh **safe hai lekin sirf tab jab** anon role ko sirf **read (SELECT)** access ho, write access bilkul na ho.

`database/rls-policy.sql` ko Supabase SQL editor mein run karo (same project jahan bot data likhta hai):

```sql
ALTER TABLE news ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access on news"
  ON news
  FOR SELECT
  USING (true);
```

Yeh confirm karta hai: koi bhi website visitor sirf **read** kar sake, insert/update/delete nahi.

**⚠️ Isay run karne ke baad, bot khud `SUPABASE_ANON_KEY` se write nahi kar payega** (kyunke RLS ab anon ko sirf read allow karti hai). Bot repo (`urdu-tech-world-news-bot`) mein `SUPABASE_SERVICE_ROLE_KEY` (Supabase dashboard → Settings → API → `service_role` secret) ko GitHub Actions secret ke tor par add karna hoga — bot code isay already prefer karta hai (fallback ke sath), yeh Phase 6 ke saath ship ho chuka hai. **`service_role` key kabhi website/browser code mein use na karo** — sirf bot ke server-side secrets mein.

## Setup Step 2 — Realtime (optional, sirf agar live updates chahiye)

Agar `realtime.js`'s `subscribeToNewArticles()` use karna hai (naye articles bina refresh ke dikhane ke liye):

Supabase dashboard → Database → Replication → `news` table ko ON karo.

Ya SQL se:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE news;
```

Agar yeh nahi karte, baaki sab kuch normally kaam karega — sirf realtime live-update feature inactive rahegi.

## Setup Step 3 — Config

```bash
cp config.example.js config.js
```

`config.js` mein `SUPABASE_URL` aur `SUPABASE_ANON_KEY` (dono Supabase dashboard → Settings → API se) fill karo. Yeh values secret nahi hain (RLS unhein protect karti hai step 1 ke baad), isliye commit karna safe hai — lekin agar aap phir bhi commit nahi karna chahte, `config.js` ko apni website repo ke `.gitignore` mein add kar sakte hain aur deploy-time par inject kar sakte hain.

Yeh files apni Nexora News Urdu repo mein copy kar do (`config.js`, `supabaseClient.js`, `newsApi.js`, `realtime.js`, `utils.js` — jaisi directory structure chahiye waisi rakh sakte hain, sirf relative import paths adjust kar lena).

---

## Usage

### Homepage — Hero, Breaking, Trending, Latest (with category filter)

```js
import { getHeroNews, getBreakingNews, getTrendingNews, getLatestNews, getCategories } from "./newsApi.js";

const hero = await getHeroNews();                          // single most recent article
const breaking = await getBreakingNews();                  // last 2 hours (configurable), never empty
const trending = await getTrendingNews();                  // recency-based for now (see note below)
const categories = await getCategories();                  // e.g. ["Business", "Sports", "Technology", "World"]
const { items, page, totalPages } = await getLatestNews({ page: 1, category: "Technology" }); // paginated
```

Poora working example: `examples/homepage-example.html`.

### Article Page

```js
import { getArticleById } from "./newsApi.js";

const params = new URLSearchParams(location.search);
const article = await getArticleById(params.get("id"));
// article.urdu_title, article.urdu_summary, article.article, article.seo_title
// (for <title>/meta tags), article.image_url, article.category, article.source,
// article.hashtags, article.url (original source link), article.created_at
```

Poora working example: `examples/article-example.html`.

### Search

```js
import { searchNews } from "./newsApi.js";

const { items, totalCount } = await searchNews("technology", { page: 1 });
```

Urdu title, Urdu summary, aur original (English) title — teeno mein case-insensitive partial match karta hai.

### Live Updates (Realtime)

```js
import { subscribeToNewArticles } from "./realtime.js";

const stop = subscribeToNewArticles((newArticle) => {
  // prepend to your Breaking News / Latest News list
});

// jab chahiye band karo:
stop();
```

---

## Design Notes / Known Limitations

- **"Hero" news** = sirf sabse recent article (koi manual "featured" flag abhi exist nahi karta). Agar future mein admin dashboard (Phase 7) se manual curation chahiye ho, ek `is_hero`/`featured` boolean column add karke `getHeroNews()` ko update kiya ja sakta hai.
- **"Breaking" news** = pichle 2 ghante ke articles (heuristic, koi explicit "is_breaking" flag nahi hai). Configurable via `getBreakingNews({ windowHours: N })`.
- **"Trending" news** = abhi sirf recency-based hai (last 48 hours). Asal engagement-based trending ke liye `views`/`engagement_score` columns chahiye (bot ka Phase 8 — Monitoring & Analytics — inhein propose karta hai). Jab wo columns add ho jayen, `getTrendingNews()` automatically unhein use karna shuru kar dega (already coded to try `views` first, gracefully fall back to recency agar column exist na kare).
- **Categories** ek bounded recent sample (last 500 rows) se client-side deduplicate ki jati hain. Data grow karne par ek dedicated categories table/RPC zyada scalable hoga (future consideration, Phase 9).
- **Article URLs** `?id=<database-id>` use karti hain (koi `slug` column abhi nahi hai). Pretty URLs (`/article/some-title`) ke liye future mein bot ki schema mein ek `slug` column add karna hoga — is code ka baaki hissa unaffected rahega, sirf `getArticleById` ki jagah `getArticleBySlug` add hoga.
- Har function sirf **public-facing columns** select karta hai (`image_prompt`, `facebook_post`, aur publish-status tracking columns jaisi internal fields exclude ki gayi hain) — website ka payload lean rehta hai.

## Testing Performed

Is environment mein real Supabase project (jo bot use karta hai) available nahi hai, isliye live end-to-end testing nahi ho saki. Jo verify kiya:

- Har function ke actual Supabase JS SDK query calls ko mock-`fetch` se intercept kar ke, **exact generated PostgREST REST API URLs verify kiye** — sab query strings (filters, `.or()` syntax, pagination `range`, `order`, etc.) syntactically correct hain, using the real `@supabase/supabase-js` package (not a reimplementation).
- `utils.js` ke sab pure functions (`formatRelativeTime`, `resolveImageUrl`, `excerpt`, `articleUrl`) unit-tested — Urdu locale date formatting bhi confirm ki.
- Syntax-validated sab files.

**Live-verify nahi ho saka**: actual Supabase project ke against real data fetch, RLS policy ka actual enforcement, Realtime subscription ka live event firing. Recommend: apna Supabase URL/key `config.js` mein daal kar `examples/homepage-example.html` browser mein open karo (local static server se, e.g. `npx serve`), aur confirm karo data load ho raha hai.
