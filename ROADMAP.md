# Roadmap — Urdu Tech & World News Bot

Yeh roadmap current codebase (RSS fetch → Groq AI translation/summary → Supabase storage → GitHub Actions cron) ke upar based hai. Har phase ke saath uska maqsad, kaam, aur "done" hone ka criteria diya gaya hai.

---

## Phase 0 — Current State (✅ Done)

- [x] BBC RSS feed se news fetch (`rss-parser`)
- [x] Groq LLM (`llama-3.3-70b-versatile`) se Urdu translation + summary + article + hashtags + Facebook post + image prompt generate karna
- [x] Supabase mein `news` table mein data save karna
- [x] GitHub Actions cron job (har ghante) se automation

---

## Phase 1 — Stability & Correctness Fixes (Priority: High)

Pehle jo bana hai usay reliable banao, tabhi upar naya kaam karna faida dega.

- [ ] **Duplicate bug fix**: `existing.length > 0` check ke baad `return;` ko actually enable karo (abhi comment out hai), taake same news dobara process/insert na ho.
- [ ] **Multiple items per run**: `feed.items[0]` ki jagah loop lagao (jaise top 5–10 items), taake sirf headline hi baar baar process na ho aur real coverage mile.
- [ ] **Per-item error isolation**: Agar ek item process karte hue error aaye (AI fail, malformed response), to pura run crash na ho — baaki items continue hon.
- [ ] **AI response validation**: Agar Groq response expected format match nahi karta (regex fail), to us item ko skip/log karo instead of empty strings DB mein save karna.
- [ ] **Retry logic**: Groq API ya Supabase call fail ho to 1–2 retries with backoff.
- [ ] **Basic logging cleanup**: Debug `console.log`s (API key length, raw JSON dump) hata kar structured, concise logging rakho.

**Done criteria**: Bot bina duplicate ya crash ke, multiple fresh news items reliably process kar sake.

---

## Phase 2 — Multi-Source Coverage (Priority: High)

- [ ] RSS sources ko array mein configure karo (e.g. BBC, Reuters, Dawn, Geo News, Al Jazeera) — hardcoded single URL ki jagah.
- [ ] Har source ke liye `source` field DB mein already hai — sirf loop se sab feeds process karo.
- [ ] Category-wise source mapping (Tech, World, Business, Sports) — agar niche wali audience specific chahiye.
- [ ] Rate-limiting/throttling Groq calls ke beech (free-tier limits se bachne ke liye).

**Done criteria**: Bot 3+ independent news sources se news collect kar sake, bina ek dusre ko block kiye.

---

## Phase 3 — Publishing / Distribution Layer (Priority: High — asli value yahan hai)

Abhi `facebook_post` field generate ho kar sirf DB mein baithi hai, kisi ko dikhti nahi. Yeh sabse important missing piece hai.

- [ ] **Facebook Graph API integration**: Page access token setup, aur generated `facebook_post` + image ko automatically Facebook Page par publish karo.
- [ ] Publish status track karo DB mein (e.g. `published_at`, `fb_post_id` columns) taake dobara publish na ho.
- [ ] (Optional) Telegram channel bot ya WhatsApp Business API bhi add karo agar wahan audience hai.
- [ ] (Optional) Twitter/X posting agar short-form bhi chahiye.

**Done criteria**: Naya news item process hote hi, bina manual intervention, Facebook Page par Urdu post ke saath live nazar aaye.

---

## Phase 4 — Image Pipeline Improvement (Priority: Medium)

- [ ] Pollinations.ai se image generate karke usay **download** karo aur Supabase Storage (ya koi CDN) mein permanently upload karo — abhi sirf on-the-fly URL hai jo reliably load nahi hogi.
- [ ] Facebook post ke saath image attach karna (Graph API supports image upload with post).
- [ ] Fallback image (agar generation fail ho) taake post kabhi bina image ke na jaye.

**Done criteria**: Har published post ke saath ek stable, permanently-hosted image ho.

---

## Phase 5 — Frontend / Dashboard (Priority: Medium, agar goal sirf social-posting nahi balke website bhi hai)

- [ ] Simple Next.js/React site jo Supabase se news fetch kar ke Urdu mein list/detail pages dikhaye.
- [ ] Category filter, search, aur latest-news homepage.
- [ ] SEO-friendly URLs har article ke liye.

**Done criteria**: Public-facing website live ho jahan users Urdu news browse kar sakein.

**Note**: Agar aapka primary goal sirf social media automation hai (Facebook/Telegram), to Phase 5 skip kar ke Phase 3–4 par focus karna zyada efficient hoga.

---

## Phase 6 — Observability & Scale (Priority: Low, later stage)

- [ ] Monitoring/alerts (e.g. run fail hone par email/Telegram notification).
- [ ] Analytics: kitni news process hui, kitni published hui, engagement metrics (Facebook likes/shares) DB mein track karo.
- [ ] Cost tracking (Groq API usage, agar paid tier par jayen).
- [ ] Move cron frequency ko dynamic karo (e.g. breaking news detect ho to immediately process, warna normal hourly).

**Done criteria**: System ka health aur performance bina manually GitHub Actions logs check kiye pata chal sake.

---

## Suggested Order of Execution

1. **Phase 1** (fixes) — thodi der ka kaam, sabse zyada leverage.
2. **Phase 3** (Facebook publishing) — yeh core value unlock karta hai; abhi tak sab kuch generate ho kar waste ho raha hai.
3. **Phase 2** (multi-source) — coverage badhane ke liye.
4. **Phase 4** (image pipeline) — publishing ko polish karne ke liye.
5. **Phase 5 / Phase 6** — jab base automation stable ho jaye, tab scale/frontend par jao.
