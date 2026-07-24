# Folder Structure

## Current Structure (as-is)

```
urdu-tech-world-news-bot/
├── .github/
│   └── workflows/
│       └── news.yml          # GitHub Actions cron automation
├── index.js                  # Entire bot logic (fetch + AI + save)
├── package.json
├── README.md
└── (documentation files — this set)
```

Yeh flat structure ek single-script MVP ke liye theek thi, lekin Phase 1+ ke kaam (multi-source, multi-channel, dashboard, tests) ke liye scale nahi karegi.

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
│   │   └── sources.config.js     # (Phase 2) list of RSS feeds + category mapping
│   │
│   ├── ai/
│   │   ├── processor.js          # Groq call + response handling (Phase 3)
│   │   ├── prompts.js            # Versioned prompt templates
│   │   └── schema.js             # Output validation schema (e.g. zod)
│   │
│   ├── image/
│   │   └── pipeline.js           # (Phase 5) generate → download → optimize → store
│   │
│   ├── db/
│   │   ├── client.js             # Supabase client init
│   │   └── news.repository.js    # All `news` table queries centralized
│   │
│   ├── publishers/
│   │   ├── facebook.js           # (Phase 4)
│   │   ├── telegram.js           # (Phase 4)
│   │   ├── whatsapp.js           # (Phase 4)
│   │   └── x.js                  # (Phase 4)
│   │
│   ├── lib/
│   │   └── logger.js             # Structured logging helper
│   │
│   └── run.js                    # Main entrypoint, replaces current index.js
│
├── website/                      # (Phase 6, if built in-repo rather than external Nexora integration)
│   └── ...                       # Next.js app
│
├── dashboard/                    # (Phase 7, if built as a separate app)
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
- Whether `website/` and `dashboard/` live in this repo or as separate repos depends on the open question in `PROJECT_ROADMAP.md` (Phase 6) about whether Nexora News Urdu is an existing external site or a new build.

## Root-Level Documentation Files (current)

All `.md` docs currently live at repo root for visibility (GitHub renders root `README.md` and links between root-level docs work simply). If the doc set grows further, consider moving non-`README.md` docs into a `docs/` folder with an index, but keep `README.md` at root as the entrypoint either way.
