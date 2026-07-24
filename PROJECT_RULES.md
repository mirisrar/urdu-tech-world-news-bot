# Project Rules

Yeh document team/contributors ke liye baseline rules define karta hai — kaam consistent aur maintainable rahe isliye.

## 1. General Principles

- **Stability pehle, features baad mein** — koi bhi naya feature add karne se pehle Phase 1 (stability fixes) ka respect karo. Naya kaam purani buggy foundation par mat banao.
- **Har phase ka "Done Criteria" hona chahiye** — `PROJECT_ROADMAP.md` mein defined criteria ke bina kisi phase ko "complete" mat maano.
- **Content pipeline ka single source of truth** — AI-processed content Database mein hi rahe; website/social publishers sirf **read** karein, apna alag processing na karein (duplicate logic avoid karne ke liye).

## 2. Git & Branching Rules

- Branch naming: `feature/<name>`, `fix/<name>`, `docs/<name>`, `chore/<name>`.
- Commit messages **Conventional Commits** format follow karein: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`.
- Direct push `main` par avoid karo — PR ke through merge karo (agar solo development hai to bhi PR review-style self-check karo).
- Ek PR = ek logical change. Bohot sare unrelated changes ek PR mein mat daalo.

## 3. Secrets & Environment Variables

- Koi bhi API key, token, ya credential **kabhi code mein hardcode na karo**.
- Sab secrets `.env` (local) ya GitHub Actions Secrets (production) mein rakho.
- `.env` file **kabhi git mein commit na karo** — `.gitignore` mein add rakho.
- Naya secret add karte waqt `.env.example` update karo (bina actual value ke, sirf key name).

## 4. Database Rules

- Schema changes `DATABASE_SCHEMA.md` mein document karo, bina documentation update kiye migration mat karo.
- Har naya column backward-compatible hona chahiye (existing rows null-safe rahen).
- Destructive operations (DROP, DELETE bulk) sirf manual review ke baad.

## 5. AI Output Rules

- AI se generated content ko **kabhi bina validation ke publish mat karo** — malformed/incomplete response ko skip/flag karo, DB mein empty strings mat save karo.
- AI prompts ko version control mein track karo (`AI_PIPELINE.md` mein documented).
- Sensitive/harmful content filter ka plan rakho (future: content moderation step before publish).

## 6. Publishing Rules

- Ek news item sirf **ek dafa** har channel par publish ho — publish status DB mein track karo.
- Manual override capability honi chahiye (admin dashboard se kisi post ko block/unpublish kar sakein).

## 7. Code Review Checklist (self ya peer)

- [ ] Naya code existing patterns follow karta hai (`CODING_STANDARDS.md`)?
- [ ] Errors properly handled hain, silent failures nahi hain?
- [ ] Secrets exposed nahi ho rahe (logs mein bhi nahi)?
- [ ] Relevant documentation update hui hai?
- [ ] Agar tests exist karte hain, wo pass ho rahe hain?

## 8. Documentation Maintenance

- Jab bhi architecture/behavior change ho, related `.md` file same PR mein update karo.
- `CHANGELOG.md` har meaningful release/change ke baad update karo.
