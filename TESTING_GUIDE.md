# Testing Guide

## Current State

**Koi automated tests exist nahi karte** is project mein abhi. Verification purely manual hai (script run karo, Supabase/logs check karo). Yeh Phase 1 ka ek gap hai jo stability ke liye address karna chahiye.

## Recommended Testing Strategy

### 1. Test Runner

Use **`node:test`** (built into Node.js, zero extra dependency) ya **`vitest`** (agar richer DX chahiye — mocking, watch mode). ESM-native, current `"type": "module"` setup ke saath directly compatible.

```bash
npm install --save-dev vitest
```

```json
// package.json
"scripts": {
  "test": "vitest run"
}
```

### 2. What to Test First (Priority Order)

#### a) AI Response Parsing (Pure Function — Easiest to Test)

Extract regex-parsing logic (currently inline in `run()`) into a standalone function, e.g. `parseAiResponse(aiText)`, then test:

```javascript
import { describe, it, expect } from "vitest";
import { parseAiResponse } from "../src/ai/processor.js";

describe("parseAiResponse", () => {
  it("extracts all fields from a well-formatted response", () => {
    const sample = `CATEGORY: Technology
URDU_TITLE: ٹیسٹ ہیڈلائن
URDU_SUMMARY: یہ ایک ٹیسٹ خلاصہ ہے۔
ARTICLE: Full article text here...
FACEBOOK_POST: Full facebook post text here...
HASHTAGS: #News #Technology
IMAGE_PROMPT: A professional tech illustration`;

    const result = parseAiResponse(sample);
    expect(result.category).toBe("Technology");
    expect(result.urduTitle).toBe("ٹیسٹ ہیڈلائن");
  });

  it("defaults gracefully when a field is missing", () => {
    const result = parseAiResponse("CATEGORY: Technology");
    expect(result.urduTitle).toBe("");
  });

  it("flags/throws when response is completely malformed", () => {
    // once schema validation (Phase 3) is added, assert it rejects garbage input
  });
});
```

#### b) Duplicate Detection Logic

Mock the Supabase client, verify that when a URL already exists, the item is correctly skipped (this directly targets the known Phase 1 bug — a regression test here prevents it from reappearing).

#### c) RSS Collector Normalization

Given a sample RSS feed item shape, verify the collector extracts `title`/`link` correctly, and (once Phase 2 lands) that multiple sources are all iterated.

### 3. Mocking External Services

- **Groq API**: mock `fetch` (e.g. `vi.fn()` / `msw`) to return canned responses — never hit the real API in tests (cost + flakiness).
- **Supabase**: use a test double / mock client rather than a real Supabase project in unit tests. For integration tests, consider a dedicated test Supabase project (never run destructive tests against production).
- **RSS feeds**: use fixture XML files instead of live network calls.

### 4. Integration Tests (Later, Optional)

Once modules are separated (`FOLDER_STRUCTURE.md`), a small number of integration tests can run the full pipeline against a test Supabase project + a mocked AI response, verifying end-to-end that a row is correctly inserted.

### 5. CI Integration

Add a `test` step to the CI workflow (see `DEVELOPMENT_WORKFLOW.md` §4) so tests run automatically on every PR, not just locally.

### 6. What NOT to Test (at this stage)

- Don't write tests against the real Groq/Supabase/Pollinations APIs in CI — slow, costly, flaky, and not deterministic.
- Don't over-invest in UI testing before Phase 6/7 UI actually exists.

## Manual Testing Checklist (until automated tests exist)

- [ ] `node index.js` run karo locally with valid `.env` — confirm no unhandled errors.
- [ ] Supabase table mein naya row check karo — sab fields populated hain (empty string nahi, especially `facebook_post` aur `article`).
- [ ] Same script dobara run karo — confirm duplicate insert nahi hota (currently will FAIL due to known bug — see `PROJECT_ROADMAP.md` Phase 1).
- [ ] GitHub Actions "Run workflow" manually trigger karo — Actions tab mein logs check karo.
