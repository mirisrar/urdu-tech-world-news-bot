# Contributing

Shukriya is project mein contribute karne ke liye! Neeche guidelines hain taake kaam consistent aur smooth rahe.

## Before You Start

1. `PROJECT_OVERVIEW.md` aur `PROJECT_ROADMAP.md` padho — samajh lo project kis direction mein ja raha hai aur abhi kaun sa phase priority hai.
2. `PROJECT_RULES.md` aur `CODING_STANDARDS.md` review karo.
3. Check karo koi existing issue/PR already same kaam par kaam nahi kar raha.

## How to Contribute

### Reporting Bugs

- Clearly describe: kya expected tha, kya actual hua, reproduce kaise karein.
- Agar possible ho, relevant logs/error messages attach karo (secrets redact kar ke!).

### Suggesting Features

- Check karo ke feature `PROJECT_ROADMAP.md` mein already planned hai ya nahi — agar hai, to us phase ke discussion mein contribute karo.
- Naya feature jo roadmap se bahar hai, usay pehle discuss karo (issue open karo) — directly bara PR mat bhejo bina alignment ke.

### Submitting Code Changes

1. Repo fork/clone karo, branch banao (`feature/...`, `fix/...`, `docs/...` — see `DEVELOPMENT_WORKFLOW.md`).
2. Change implement karo, `CODING_STANDARDS.md` follow karo.
3. Agar behavior/architecture change hui ho, relevant documentation update karo same PR mein.
4. Commit messages **Conventional Commits** format mein ho (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`).
5. Locally verify karo ke change kaam karta hai (manual test ya, jab available ho, `npm test` — see `TESTING_GUIDE.md`).
6. Pull Request open karo `main` ki taraf, clear description ke saath: kya change hua aur kyun.

## PR Review Expectations

- Ek PR = ek logical change (see `PROJECT_RULES.md`).
- Self-review checklist follow karo before requesting review (`PROJECT_RULES.md` §7).
- Secrets/credentials kisi bhi form mein PR diff mein nahi honi chahiye.

## Priority Areas (current — see `PROJECT_ROADMAP.md`)

Sabse zyada valuable contributions abhi **Phase 1 (Stability & Bug Fixes)** aur **Phase 3 (AI Processing Pipeline)** mein hain:

- Duplicate detection bug fix
- Multi-item processing loop
- Structured/validated AI output
- Basic test coverage
- Error handling improvements

Agar aap contribute karna chahte hain lekin sure nahi ke kahan se start karein, yeh areas best starting point hain.

## Code of Conduct (Lightweight)

- Respectful, constructive communication rakho reviews/discussions mein.
- Assume good intent — agar kisi ka code/suggestion samajh nahi aa raha, clarify karne ke liye pucho, criticize karne se pehle.

## Questions?

Agar kuch unclear ho, related documentation file check karo pehle (`README.md` mein full index hai), phir issue open kar ke discuss karo.
