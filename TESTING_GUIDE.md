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

`parseAiResponse(aiText)` (currently inline in `index.js`) is `JSON.parse`-based as of Phase 3 (previously regex-based) — extract it into a standalone module and test it:

```javascript
import { describe, it, expect } from "vitest";
import { parseAiResponse } from "../src/ai/processor.js";

describe("parseAiResponse", () => {
  it("extracts all fields from a well-formatted JSON response", () => {
    const sample = JSON.stringify({
      category: "Technology",
      urduTitle: "ٹیسٹ ہیڈلائن",
      urduSummary: "یہ ایک ٹیسٹ خلاصہ ہے۔",
      seoTitle: "ٹیسٹ SEO ٹائٹل",
      article: "Full article text here...",
      hashtags: ["#News", "#Technology"],
      facebookPost: "Full facebook post text here...",
      imagePrompt: "A professional tech illustration"
    });

    const result = parseAiResponse(sample);
    expect(result.category).toBe("Technology");
    expect(result.urduTitle).toBe("ٹیسٹ ہیڈلائن");
    expect(result.hashtags).toBe("#News #Technology"); // joined into a single string for the DB
  });

  it("defaults gracefully when a field is missing", () => {
    const result = parseAiResponse(JSON.stringify({ category: "Technology" }));
    expect(result.urduTitle).toBe("");
  });

  it("throws on malformed/truncated JSON", () => {
    expect(() => parseAiResponse('{"category": "Tech", "urduTitle": "incomplete...')).toThrow();
  });

  it("falls back to an empty string for a non-array hashtags value", () => {
    const result = parseAiResponse(JSON.stringify({ urduTitle: "T", urduSummary: "S", article: "A", hashtags: "not-an-array" }));
    expect(result.hashtags).toBe("");
  });
});
```

#### b) Duplicate Detection Logic

Mock the Supabase client, verify that when a URL already exists, the item is correctly skipped (this directly targets the known Phase 1 bug — a regression test here prevents it from reappearing).

#### c) RSS Collector Normalization

Given a sample RSS feed item shape, verify the collector extracts `title`/`link` correctly, and (once Phase 2 lands) that multiple sources are all iterated.

### 3. Mocking External Services

- **Gemini API**: mock `fetch` (e.g. `vi.fn()` / `msw`) to return canned responses — never hit the real API in tests (cost + flakiness).
- **Supabase**: use a test double / mock client rather than a real Supabase project in unit tests. For integration tests, consider a dedicated test Supabase project (never run destructive tests against production).
- **RSS feeds**: use fixture XML files instead of live network calls.

### 4. Integration Tests (Later, Optional)

Once modules are separated (`FOLDER_STRUCTURE.md`), a small number of integration tests can run the full pipeline against a test Supabase project + a mocked AI response, verifying end-to-end that a row is correctly inserted.

### 5. CI Integration

Add a `test` step to the CI workflow (see `DEVELOPMENT_WORKFLOW.md` §4) so tests run automatically on every PR, not just locally.

### 6. What NOT to Test (at this stage)

- Don't write tests against the real Gemini/Supabase/Pollinations APIs in CI — slow, costly, flaky, and not deterministic.
- Don't over-invest in UI testing before Phase 6/7 UI actually exists.

## Manual Testing Checklist (until automated tests exist)

- [ ] `node index.js` run karo locally with valid `.env` — confirm no unhandled errors.
- [ ] Supabase table mein naya row check karo — sab fields populated hain (empty string nahi, especially `facebook_post` aur `article`).
- [ ] Same script dobara run karo — confirm duplicate insert nahi hota (currently will FAIL due to known bug — see `PROJECT_ROADMAP.md` Phase 1).
- [ ] GitHub Actions "Run workflow" manually trigger karo — Actions tab mein logs check karo.
