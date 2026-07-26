/**
 * Phase 9 — lightweight in-run / DB title dedupe helpers.
 * Avoids spending Gemini calls on near-duplicate headlines from
 * overlapping Google News + Dawn/Geo feeds.
 */

/**
 * Normalize a headline for comparison (lowercase, strip punctuation/noise).
 * @param {string} title
 * @returns {string}
 */
export function normalizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0600-\u06FF]+/g, (m) => m) // keep Urdu letters
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\u0600-\u06FF\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Token set for Jaccard-style overlap (words length >= 3).
 * @param {string} normalized
 * @returns {Set<string>}
 */
export function titleTokens(normalized) {
  return new Set(
    normalized
      .split(" ")
      .map((t) => t.trim())
      .filter((t) => t.length >= 3)
  );
}

/**
 * @param {Set<string>} a
 * @param {Set<string>} b
 * @returns {number} 0..1
 */
export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) {
    if (b.has(t)) inter++;
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * True if titles are the same or highly similar.
 * @param {string} titleA
 * @param {string} titleB
 * @param {number} [threshold=0.72]
 */
export function isSimilarTitle(titleA, titleB, threshold = 0.72) {
  const na = normalizeTitle(titleA);
  const nb = normalizeTitle(titleB);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // One contains the other (common with truncated Google cluster titles).
  if (na.length >= 24 && nb.length >= 24 && (na.includes(nb) || nb.includes(na))) {
    return true;
  }
  return jaccard(titleTokens(na), titleTokens(nb)) >= threshold;
}

/**
 * Returns true if `title` is similar to any title in `existingTitles`.
 * @param {string} title
 * @param {Iterable<string>} existingTitles
 * @param {number} [threshold]
 */
export function matchesAnyTitle(title, existingTitles, threshold = 0.72) {
  for (const existing of existingTitles) {
    if (isSimilarTitle(title, existing, threshold)) return true;
  }
  return false;
}
