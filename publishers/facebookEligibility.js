/**
 * Facebook eligibility — only "important" news go to Feed / Schedule.
 *
 * Important if ANY:
 *   - category in allowlist (default: Pakistan, Politics, World)
 *   - featured === true
 *
 * Same-day only (default ON): skip yesterday when the date rolls over.
 * Also skip if older than FACEBOOK_MAX_AGE_HOURS when same-day is off.
 *
 * Env:
 *   FACEBOOK_IMPORTANT_ONLY=true|false   (default true)
 *   FACEBOOK_IMPORTANT_CATEGORIES=Pakistan,Politics,World
 *   FACEBOOK_SAME_DAY_ONLY=true|false    (default true)
 *   FACEBOOK_TIMEZONE=Asia/Karachi
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

/** @returns {boolean} */
export function isFacebookSameDayOnlyEnabled() {
  return envFlag("FACEBOOK_SAME_DAY_ONLY", true);
}

/** @returns {string} */
export function getFacebookTimezone() {
  return String(process.env.FACEBOOK_TIMEZONE || "Asia/Karachi").trim() || "Asia/Karachi";
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
 * Calendar date YYYY-MM-DD in the Facebook timezone.
 * @param {number|Date} [when]
 * @returns {string}
 */
export function facebookCalendarDate(when = Date.now()) {
  const ms = when instanceof Date ? when.getTime() : Number(when);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: getFacebookTimezone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(ms));
}

/**
 * Start of "today" in FACEBOOK_TIMEZONE as a Date (UTC instant).
 * Asia/Karachi is fixed UTC+5 (no DST).
 * @param {number|Date} [when]
 * @returns {Date}
 */
export function startOfFacebookDay(when = Date.now()) {
  const dateStr = facebookCalendarDate(when);
  // Asia/Karachi is fixed UTC+5 (no DST) — midnight local → ISO instant.
  return new Date(`${dateStr}T00:00:00+05:00`);
}

/**
 * @param {string|Date|number|null|undefined} createdAt
 * @param {number|Date} [now]
 * @returns {boolean}
 */
export function isFacebookCreatedToday(createdAt, now = Date.now()) {
  if (createdAt === null || createdAt === undefined || createdAt === "") {
    return true;
  }
  const ms =
    createdAt instanceof Date
      ? createdAt.getTime()
      : Date.parse(String(createdAt));
  if (!Number.isFinite(ms)) return true;
  return facebookCalendarDate(ms) === facebookCalendarDate(now);
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
  const featured = opts.featured === true || opts.featured === "true" || opts.featured === 1;

  if (isFacebookImportantFilterEnabled()) {
    const categoryOk = categoryIsImportant(opts.category);
    if (!featured && !categoryOk) {
      return { ok: false, reason: "not_important_category" };
    }
  }

  if (isFacebookSameDayOnlyEnabled()) {
    if (!isFacebookCreatedToday(opts.createdAt)) {
      return { ok: false, reason: "not_today" };
    }
  } else if (
    opts.createdAt !== null &&
    opts.createdAt !== undefined &&
    opts.createdAt !== ""
  ) {
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
