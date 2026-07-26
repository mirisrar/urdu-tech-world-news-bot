# Folder Structure

## Current Structure (as of Phase 8)

```
urdu-tech-world-news-bot/
├── .github/
│   └── workflows/
│       └── news.yml          # GitHub Actions cron automation
├── publishers/                # Phase 4 social publishers
│   ├── facebook.js
│   ├── telegram.js
│   ├── x.js
│   ├── whatsapp.js
│   └── index.js               # publishAll() orchestrator
├── monitoring/
│   └── runAlert.js            # Phase 8 — Telegram end-of-run health alert
├── website-integration/       # Phase 6 — copy into Nexora News Urdu repo
│   ├── supabaseClient.js
│   ├── newsApi.js
│   ├── realtime.js
│   ├── utils.js
│   ├── config.example.js
│   ├── database/rls-policy.sql
│   ├── database/schema-align.sql
│   ├── examples/
│   └── README.md
├── newsapi.js
├── imagePipeline.js
├── index.js                   # Collector + dedupe + AI + image + DB + publish + run alert
├── package.json
├── README.md
└── (documentation files — this set)
```

`publishers/` is the first step away from the original single-file structure — each social channel is now its own testable module. `website-integration/` is different from everything else in this repo: it's **not executed by this bot at all** — it's a deliverable meant to be copied into Nexora News Urdu's own separate repository. `index.js` itself still contains the collector, dedupe, AI, and DB logic inline; extracting those into their own modules (as originally proposed below) remains future work, most valuable once tests are added (`TESTING_GUIDE.md`) or the file grows harder to navigate.

## Proposed Structure (Target, evolves phase-by-phase)

```
urdu-tech-world-news-bot/
├── .github/
│   └── workflows/
│       ├── news.yml              # Collector + AI processing run
│       └── publish.yml           # (Phase 4) separate publishing job
│
├── src/
│   ├── collector/
│   │   ├── index.js              # Orchestrates fetching all configured sources
│   │   └── sources.config.js     # (Phase 2, done — currently a SOURCES const in index.js, not yet its own file) list of RSS feeds + category mapping
│   │
│   ├── ai/
│   │   ├── processor.js          # Gemini call + response handling (Phase 3, done — currently in index.js)
│   │   ├── prompts.js            # Versioned prompt templates (Phase 3 has PROMPT_VERSION but no separate file yet)
│   │   └── schema.js             # Output validation schema (Phase 3 uses inline responseSchema + typeof checks, no zod)
│   │
│   ├── image/
│   │   └── pipeline.js           # ✅ Done (Phase 5) — actually exists at repo root as `imagePipeline.js`, not yet moved under `src/`
│   │
│   ├── db/
│   │   ├── client.js             # Supabase client init
│   │   └── news.repository.js    # All `news` table queries centralized (writeWithColumnFallback exists in index.js, not yet extracted)
│   │
│   ├── publishers/                # ✅ Done (Phase 4) — actually exists at repo root as `publishers/`, not yet moved under `src/`
│   │   ├── facebook.js
│   │   ├── telegram.js
│   │   ├── whatsapp.js
│   │   ├── x.js
│   │   └── index.js               # publishAll() orchestrator
│   │
│   ├── lib/
│   │   └── logger.js             # Structured logging helper (minimal version exists inline in index.js)
│   │
│   └── run.js                    # Main entrypoint, replaces current index.js
│
├── website-integration/            # ✅ Done (Phase 6) — already exists at repo root (see current structure above); no webhook publisher needed, direct Supabase read was the chosen approach
│
├── monitoring/
│   └── runAlert.js               # Phase 8 — Telegram end-of-run health alert
├── (Admin CMS + Analytics live in the website repo under admin/ — Phase 7/8 done)
│   └── ...
│
├── tests/
│   ├── ai/
│   ├── collector/
│   └── db/
│
├── docs/                         # (optional) could house all *.md docs instead of repo root
│
├── .env.example
├── index.js                      # kept temporarily as a thin wrapper calling src/run.js, or removed once migrated
├── package.json
└── README.md
```

## Migration Notes

- This restructuring is **not required for Phase 1** (bug fixes can land in `index.js` as-is). It becomes worthwhile starting **Phase 2/3**, when multiple sources and a dedicated AI module justify separate files.
- Migrate incrementally — extract one concern at a time (e.g. `db/news.repository.js` first, since it's the simplest, well-bounded piece), rather than a single big-bang rewrite.
- Nexora News Urdu (the website) is an **existing, already-deployed site external to this repo** — no `website/` folder is needed here; `website-integration/` holds code meant to be copied *into* that separate repo. Admin CMS already lives in the website repo under `admin/` (Phase 7 done).

## Root-Level Documentation Files (current)

All `.md` docs currently live at repo root for visibility (GitHub renders root `README.md` and links between root-level docs work simply). If the doc set grows further, consider moving non-`README.md` docs into a `docs/` folder with an index, but keep `README.md` at root as the entrypoint either way.
