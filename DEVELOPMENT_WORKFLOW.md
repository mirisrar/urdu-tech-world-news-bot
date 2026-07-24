# Development Workflow

## 1. Local Setup

```bash
git clone <repo-url>
cd urdu-tech-world-news-bot
npm install
cp .env.example .env   # fill in real values (see below)
node index.js
```

### Required Environment Variables (local `.env`)

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
GEMINI_API_KEY=
```

> `.env` file **kabhi commit na karo**. `.env.example` mein sirf key names rakho.

## 2. Branching Strategy

- `main` — always deployable/stable branch. Automation (`news.yml`) runs against this.
- Feature branches: `feature/<short-description>`
- Bug fixes: `fix/<short-description>`
- Docs: `docs/<short-description>`

## 3. Making a Change

1. Naya branch banao `main` se.
2. Change karo, related documentation update karo (agar behavior/architecture change hui ho — see `PROJECT_RULES.md` §8).
3. Locally test karo (`node index.js` manually run karo, ya jab tests exist hon to `npm test` — see `TESTING_GUIDE.md`).
4. Commit — Conventional Commits format (`feat:`, `fix:`, `docs:`, etc.).
5. Push aur Pull Request open karo `main` ki taraf.
6. Self-review checklist (`PROJECT_RULES.md` §7) follow karo.
7. Merge.

## 4. CI (Current + Recommended)

**Current**: `.github/workflows/news.yml` — sirf production automation run karta hai (cron), koi CI check (lint/test) PR par nahi chalta.

**Recommended addition**: Ek separate `ci.yml` workflow jo har PR par chale:

```yaml
name: CI
on:
  pull_request:
jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install
      - run: npm run lint   # once ESLint configured
      - run: npm test       # once test suite exists
```

Yeh ensure karega ke `main` mein hamesha lint-clean, tested code hi merge ho.

## 5. Testing Before Merge

- Manual verification abhi bhi zaroori hai (Gemini API real call, Supabase real insert) jab tak proper mocking/test suite exist na kare (`TESTING_GUIDE.md`).
- Destructive DB operations ko staging/dev Supabase project par test karo, production project par nahi.

## 6. Handling Secrets in Workflows

- Secrets sirf GitHub Actions **Secrets** (repo settings) mein store karo, workflow YAML mein hardcode kabhi nahi.
- Naya secret add karo to: (a) GitHub repo Settings → Secrets and variables → Actions mein add karo, (b) relevant workflow file mein `env:` block update karo, (c) `API_DOCUMENTATION.md` §4 update karo.

## 7. Release/Deploy Cadence

- Bot automation continuously deployed hai (`main` branch = production, cron auto-runs it) — koi explicit "release" step nahi hai abhi.
- Jab website/dashboard (Phase 6/7) add hongi, unka apna deploy pipeline hoga (see `DEPLOYMENT_GUIDE.md`).

## 8. Communication of Changes

- Significant changes (naya phase complete, breaking schema change) — `CHANGELOG.md` update karo.
- Roadmap progress — `PROJECT_ROADMAP.md` ke checkboxes tick karte raho jaise-jaise kaam complete ho.
