# Urdu Tech & World News Bot

Automated news aggregation aur AI pipeline — RSS se news collect karta hai, Google Gemini LLM se Urdu translation/summary/categorization/Facebook-post generate karta hai, aur Supabase mein store karta hai. GitHub Actions cron se hourly automatically chalta hai.

## Quick Start

```bash
npm install
cp .env.example .env   # SUPABASE_URL, SUPABASE_ANON_KEY, GEMINI_API_KEY fill karo
node index.js
```

## Documentation Index

| Document | Purpose |
|---|---|
| [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md) | Project ka maqsad, target audience, current status |
| [`PROJECT_ROADMAP.md`](./PROJECT_ROADMAP.md) | 9-phase execution plan (Stability → Scale) |
| [`PROJECT_RULES.md`](./PROJECT_RULES.md) | Git, secrets, database, AI, publishing rules |
| [`TECH_STACK.md`](./TECH_STACK.md) | Technologies used aur planned |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | System design, data flow diagram |
| [`BOT_ARCHITECTURE.md`](./BOT_ARCHITECTURE.md) | Bot pipeline internals (`index.js` deep-dive) |
| [`AI_PIPELINE.md`](./AI_PIPELINE.md) | AI prompt design, output parsing, planned improvements |
| [`DATABASE_SCHEMA.md`](./DATABASE_SCHEMA.md) | Supabase `news` table schema |
| [`API_DOCUMENTATION.md`](./API_DOCUMENTATION.md) | External APIs used + planned internal API |
| [`FOLDER_STRUCTURE.md`](./FOLDER_STRUCTURE.md) | Current vs. target folder structure |
| [`UI_UX_GUIDELINES.md`](./UI_UX_GUIDELINES.md) | Website/Admin design guidelines |
| [`CODING_STANDARDS.md`](./CODING_STANDARDS.md) | JS/Node style guide |
| [`DEVELOPMENT_WORKFLOW.md`](./DEVELOPMENT_WORKFLOW.md) | Branching, PR process, CI |
| [`DEPLOYMENT_GUIDE.md`](./DEPLOYMENT_GUIDE.md) | Deployment steps (bot, website, Admin RLS/schema) |
| [`TESTING_GUIDE.md`](./TESTING_GUIDE.md) | Testing strategy (currently no tests — plan included) |
| [`SECURITY_GUIDELINES.md`](./SECURITY_GUIDELINES.md) | Secrets, DB security, AI content risks |
| [`CHANGELOG.md`](./CHANGELOG.md) | Change history |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | How to contribute |

## Current Status

See [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md#current-status-jaisa-project_roadmapmd-mein-detail-hai) for a full status table. In short: Phases 0–7 are done (~93%) — collection, Gemini AI, social publishing, image pipeline, website integration, and existing Nexora Admin CMS (with shared Supabase RLS/schema). Next: Phase 8 monitoring.