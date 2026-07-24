# UI/UX Guidelines

Yeh guidelines Phase 6 (Website) aur Phase 7 (Admin Dashboard) ke liye hain — abhi tak koi UI codebase mein exist nahi karta, is document ka purpose future build ko consistent direction dena hai.

## 1. Language & Direction

- **Primary content language**: Urdu (RTL — right-to-left).
- Website/dashboard layout ko **RTL-first** design karo, LTR ko afterthought mat banao. `dir="rtl"` HTML attribute aur RTL-aware CSS (logical properties: `margin-inline-start` instead of `margin-left`, etc.) use karo.
- Admin dashboard internal tooling ke liye LTR (English) bhi acceptable hai agar admins zyada tar English-comfortable hain — decide karo based on actual admin team.
- Numbers/dates: Urdu numerals optional hain, lekin consistency zaroori hai (sab jagah same convention).

## 2. Typography

- Urdu text ke liye web-safe, well-tested Nastaliq/Naskh fonts use karo (e.g. **Noto Nastaliq Urdu**, **Jameel Noori Nastaliq** agar licensing allow kare, ya **Noto Naskh Arabic** for a more modern/readable look).
- Font fallback chain zaroori hai (Urdu font → generic sans-serif) taake agar custom font load na ho to bhi text readable rahe.
- Line-height Urdu script ke liye thoda zyada rakho (Nastaliq scripts ko vertical space zyada chahiye) — minimum `1.8` line-height recommend hai.

## 3. Layout Principles

- **Mobile-first**: Zyada tar Urdu news consumers mobile par aayenge — desktop ko secondary priority do.
- **Card-based news listing** homepage/category pages ke liye (image + Urdu title + summary snippet + category tag).
- **Fast perceived load**: Skeleton loaders/placeholders jab news list load ho rahi ho.
- Category-based navigation clear aur prominent ho (Tech, World, Business, Sports, etc. — jo bhi categories AI classify kare).

## 4. Color & Branding

- Specific brand palette (Nexora News Urdu) decide hone tak, neutral defaults use karo: dark-on-light content area, ek accent color (category tags/CTAs ke liye).
- Dark mode support recommend hai (news sites ke liye common expectation ban gaya hai) — plan karo from day 1 agar possible ho, retrofit karna mushkil hota hai.

## 5. Accessibility

- Sufficient color contrast (WCAG AA minimum) — especially Urdu script ke liye jo already visually dense hoti hai.
- Alt text har image ke liye — AI ke `image_prompt` field ko base bana kar simple Urdu alt text generate kiya ja sakta hai.
- Keyboard navigation aur screen-reader support basic level par honi chahiye, especially agar dashboard bhi public-facing admins use karenge.

## 6. Admin Dashboard Specific (Phase 7)

- **Clarity over polish** — internal tool hai, priority: fast task completion (approve/reject news, toggle sources, view logs) na ke visual design.
- Table-heavy views (news list, RSS sources, logs) — sortable/filterable columns.
- Clear status indicators (color-coded badges: pending/processed/published/failed).
- Confirmation dialogs on destructive actions (delete source, unpublish article).

## 7. Content Presentation Rules

- Article detail page: Urdu title (large/prominent), summary, full article body, hashtags, source attribution (link back to original), category tag, publish date.
- Facebook-style content (short posts) vs. website articles (long-form) ko UI mein clearly differentiate karo — same underlying data, different presentation per channel.

## 8. Design System (Recommendation)

Jab actual UI build shuru ho, ek lightweight design system establish karo (even just a shared Tailwind config + a handful of reusable components: `NewsCard`, `CategoryBadge`, `ArticleHeader`) — is se website aur dashboard dono consistent rahenge.
