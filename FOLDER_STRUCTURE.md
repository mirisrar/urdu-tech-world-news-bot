# Folder Structure

## Current Structure (as of Phase 5)

```
urdu-tech-world-news-bot/
├── .github/
│   └── workflows/
│       └── news.yml          # GitHub Actions cron automation
├── publishers/                # ✅ Started the modularization (Phase 4)
│   ├── facebook.js
│   ├── telegram.js
│   ├── x.js
│   ├── whatsapp.js
│   └── index.js               # publishAll() orchestrator
├── newsapi.js                 # NewsAPI.org client (Phase 2-adjacent)
├── imagePipeline.js            # Download + optimize (sharp) + Supabase Storage upload (Phase 5)
├── index.js                   # Collector + dedupe + AI + image + DB + publish orchestration
├── package.json
├── README.md
└── (documentation files — this set)
```

`publishers/` is the first step away from the original single-file structure — each social channel is now its own testable module. `index.js` itself still contains the collector, dedupe, AI, and DB logic inline; extracting those into their own modules (as originally proposed below) remains future work, most valuable once tests are added (`TESTING_GUIDE.md`) or the file grows harder to navigate.

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
