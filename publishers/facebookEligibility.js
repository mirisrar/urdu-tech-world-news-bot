/**
 * Facebook eligibility — only "important" news go to Feed + Stories.
 *
 * Important if ANY:
 *   - category in allowlist (default: Pakistan, Politics, World)
 *   - featured === true
 *
 * Also skip if article is older than FACEBOOK_MAX_AGE_HOURS (default 48).
 *
 * Env:
 *   FACEBOOK_IMPORTANT_ONLY=true|false   (default true)
 *   FACEBOOK_IMPORTANT_CATEGORIES=Pakistan,Politics,World
 *   FACEBOOK_MAX_AGE_HOURS=48
 */

function envFlag(name, defaultTrue = true) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultTrue;
  return !["0", "false", "no", "off"].includes(String(raw).toLowerCase());
}

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** @returns {boolean} */
export function isFacebookImportantFilterEnabled() {
  return envFlag("FACEBOOK_IMPORTANT_ONLY", true);
}

/** @returns {string[]} lowercase category tokens */
export function getFacebookImportantCategories() {
  const raw = String(
    process.env.FACEBOOK_IMPORTANT_CATEGORIES || "Pakistan,Politics,World"
  );
  return raw
    .split(/[,|]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function facebookMaxAgeMs() {
  return envInt("FACEBOOK_MAX_AGE_HOURS", 48) * 60 * 60 * 1000;
}

/**
 * @param {string} [category]
 * @param {string[]} [allowlist]
 * @returns {boolean}
 */
export function categoryIsImportant(category, allowlist = getFacebookImportantCategories()) {
  const c = String(category || "")
    .trim()
    .toLowerCase();
  if (!c || allowlist.length === 0) return false;
  return allowlist.some((token) => c === token || c.includes(token));
}

/**
 * @param {object} [opts]
 * @param {string} [opts.category]
 * @param {boolean} [opts.featured]
 * @param {string|Date|number|null} [opts.createdAt]
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function evaluateFacebookEligibility(opts = {}) {
  if (!isFacebookImportantFilterEnabled()) {
    return { ok: true };
  }

  const featured = opts.featured === true || opts.featured === "true" || opts.featured === 1;
  const categoryOk = categoryIsImportant(opts.category);

  if (!featured && !categoryOk) {
    return { ok: false, reason: "not_important_category" };
  }

  if (opts.createdAt !== null && opts.createdAt !== undefined && opts.createdAt !== "") {
    const ms =
      opts.createdAt instanceof Date
        ? opts.createdAt.getTime()
        : Date.parse(String(opts.createdAt));
    if (Number.isFinite(ms)) {
      const age = Date.now() - ms;
      if (age > facebookMaxAgeMs()) {
        return { ok: false, reason: "too_old" };
      }
    }
  }

  return { ok: true };
}

/**
 * Convenience boolean.
 * @param {object} [opts]
 * @returns {boolean}
 */
export function isFacebookEligible(opts = {}) {
  return evaluateFacebookEligibility(opts).ok;
}
