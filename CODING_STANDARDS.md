# Coding Standards

## 1. Language & Module System

- **JavaScript (ES Modules)** — `package.json` mein `"type": "module"` already set hai. `import`/`export` use karo, `require`/`module.exports` nahi.
- Node.js version: match `.github/workflows/news.yml` (currently Node 22) — local dev bhi same major version use kare.

## 2. Async Code

- **`async`/`await`** consistently use karo — raw `.then()` chains avoid karo (current codebase already `await` use karti hai, isay maintain karo).
- Har `await` jo external call kare (fetch, Supabase, AI API) usay **try/catch** mein wrap karo — silent failures allowed nahi (see Phase 1 in roadmap).

```javascript
// Good
try {
  const result = await fetchSomething();
} catch (error) {
  logger.error("fetchSomething failed", { error });
  // handle gracefully — skip item, don't crash whole run
}

// Avoid — unhandled rejection risk
const result = await fetchSomething();
```

## 3. Naming Conventions

- Variables/functions: `camelCase` (e.g. `analyzeNews`, `urduTitle`).
- Constants (module-level, unchanging): `UPPER_SNAKE_CASE` (e.g. `GEMINI_API_URL`).
- Files: `kebab-case.js` ya `camelCase.js` — jo bhi choose karo, **consistent** rakho across the repo (current single-file setup ne yeh decide nahi kiya, naya code likhte waqt decide karo).
- Database field access: match Supabase column names exactly (`snake_case`, e.g. `urdu_title`) — mixing case conventions bugs create karta hai.

## 4. Error Handling

- Kabhi errors ko silently swallow mat karo (e.g. pehle regex match fail ho kar empty string default ho jati thi bina warning ke — Phase 1 mein validation add hui, Phase 3 mein regex hi hata di gayi structured JSON output ke sath).
- Errors ko structured log karo: `{ context, error, itemId/url }` — plain `console.log(error)` (jaisa abhi hai) insufficient hai debugging ke liye.
- Distinguish **recoverable** (skip this item, continue) vs **fatal** (stop the run) errors explicitly.

## 5. Logging

- Production code mein **debug dumps hata do** (e.g. `console.log("GEMINI KEY LENGTH:", ...)`, full raw API response dumps) — yeh sensitive info leak aur noisy logs create karte hain.
- Use levels: `info` (normal flow), `warn` (recoverable issue), `error` (failure). Simple wrapper (`src/lib/logger.js`, see `FOLDER_STRUCTURE.md`) is enough — full logging library zaroori nahi is scale par.

## 6. Secrets & Config

- Kabhi API keys/tokens hardcode mat karo. Sirf `process.env.*` se read karo.
- Naya environment variable add karte waqt `.env.example` update karo (key name only, no real value).

## 7. Comments

- Comments **kyun** (reasoning/trade-off/constraint) explain karein, **kya** (obvious code narration) nahi.
- Regex patterns jo non-obvious hain (jaise multi-line `ARTICLE` capture) — inka intent comment mein clarify karo.

## 8. Function Design

- Functions ko single responsibility ke around design karo — current `run()` function bohot kaam kar rahi hai (fetch + dedupe + AI + parse + save); jab refactor karo (Phase 1/3), isay smaller functions mein split karo.
- Pure functions (jaise AI response parsing) ko side-effect-having functions (DB calls) se separate rakho — testing aasaan ho jati hai (see `TESTING_GUIDE.md`).

## 9. Linting & Formatting (Recommended Setup)

Abhi repo mein linter/formatter configured nahi hai. Recommend:

```bash
npm install --save-dev eslint prettier eslint-config-prettier
```

- ESLint: `eslint:recommended` base + Node/ESM-aware rules.
- Prettier: default config theek hai, consistency ke liye.
- CI mein lint step add karo (`DEVELOPMENT_WORKFLOW.md` mein detail).

## 10. Dependency Management

- Naya dependency add karne se pehle socho — kya yeh really zaroori hai, ya native Node API/existing dependency se kaam chal sakta hai.
- `package.json` mein version ranges (`^`) use karo jab tak specific pinning ki wajah na ho.
