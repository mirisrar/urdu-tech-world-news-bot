/**
 * Data-fetching layer for Nexora News Urdu — reads directly from the
 * Supabase `news` table (populated by the urdu-tech-world-news-bot).
 * No webhook/API from the bot is needed; this module is the entire
 * integration surface on the website's side.
 *
 * All functions are plain async functions returning plain data (never the
 * raw Supabase response shape) so the rest of the site's vanilla JS code
 * doesn't need to know anything about Supabase's query builder.
 */

import { getSupabaseClient } from "./supabaseClient.js";

// Only public-facing columns are selected — internal operational fields
// (image_prompt, facebook_post, publish-status tracking columns) aren't
// needed by the website and are left out to keep payloads lean.
const PUBLIC_COLUMNS =
  "id, title, source, category, urdu_title, urdu_summary, seo_title, article, hashtags, image_url, image_credit, url, created_at";

const DEFAULT_PAGE_SIZE = 20;
const BREAKING_NEWS_WINDOW_HOURS = 2;
const BREAKING_NEWS_LIMIT = 5;
const TRENDING_WINDOW_HOURS = 48;
const TRENDING_LIMIT = 10;
const CATEGORY_SAMPLE_SIZE = 500;

function hoursAgoIso(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function toPagedResult(data, count, page, pageSize) {
  return {
    items: data || [],
    page,
    pageSize,
    totalCount: count ?? null,
    totalPages: count != null ? Math.max(1, Math.ceil(count / pageSize)) : null
  };
}

/**
 * The single "lead story" for the homepage — the most recent article
 * overall. (No manual "featured" flag exists yet; this is a simple,
 * always-fresh default. If Phase 7's admin dashboard later adds a
 * `featured`/`is_hero` column, swap this to order by that instead.)
 * @returns {Promise<object|null>}
 */
export async function getHeroNews() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("news")
    .select(PUBLIC_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`getHeroNews failed: ${error.message}`);
  }

  return data?.[0] ?? null;
}

/**
 * Recent articles published within the last `windowHours` (a simple proxy
 * for "breaking" — there's no explicit is_breaking flag yet). Falls back
 * to the most recent articles overall if nothing falls within the window,
 * so this section is never empty.
 * @param {object} [options]
 * @param {number} [options.limit=5]
 * @param {number} [options.windowHours=2]
 * @returns {Promise<object[]>}
 */
export async function getBreakingNews({ limit = BREAKING_NEWS_LIMIT, windowHours = BREAKING_NEWS_WINDOW_HOURS } = {}) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("news")
    .select(PUBLIC_COLUMNS)
    .gte("created_at", hoursAgoIso(windowHours))
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`getBreakingNews failed: ${error.message}`);
  }

  if (data && data.length > 0) {
    return data;
  }

  // Fallback: nothing in the recency window — return the most recent
  // articles regardless, so the Breaking News section is never empty.
  const { data: fallbackData, error: fallbackError } = await supabase
    .from("news")
    .select(PUBLIC_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (fallbackError) {
    throw new Error(`getBreakingNews fallback failed: ${fallbackError.message}`);
  }

  return fallbackData || [];
}

/**
 * The main reverse-chronological news feed, optionally filtered by category.
 * @param {object} [options]
 * @param {number} [options.page=1] - 1-indexed page number.
 * @param {number} [options.pageSize=20]
 * @param {string} [options.category] - Exact category match (see getCategories()).
 * @returns {Promise<{items: object[], page: number, pageSize: number, totalCount: number|null, totalPages: number|null}>}
 */
export async function getLatestNews({ page = 1, pageSize = DEFAULT_PAGE_SIZE, category } = {}) {
  const supabase = getSupabaseClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("news")
    .select(PUBLIC_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`getLatestNews failed: ${error.message}`);
  }

  return toPagedResult(data, count, page, pageSize);
}

/**
 * Same as getLatestNews() scoped to a category — a thin, more readable
 * alias for category landing pages.
 * @param {string} category
 * @param {object} [options]
 * @param {number} [options.page=1]
 * @param {number} [options.pageSize=20]
 */
export async function getNewsByCategory(category, { page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  return getLatestNews({ page, pageSize, category });
}

/**
 * "Trending" articles. There's no real engagement/analytics data yet
 * (Phase 8 of the bot's roadmap proposes `views`/`engagement_score`
 * columns) — this attempts to order by `views` if that column exists,
 * and gracefully falls back to a recency-based ordering (most recent
 * within `windowHours`) if it doesn't, mirroring the bot's own
 * "gracefully handle a column that doesn't exist yet" pattern
 * (see writeWithColumnFallback in the bot's index.js).
 * @param {object} [options]
 * @param {number} [options.limit=10]
 * @param {number} [options.windowHours=48]
 * @returns {Promise<object[]>}
 */
export async function getTrendingNews({ limit = TRENDING_LIMIT, windowHours = TRENDING_WINDOW_HOURS } = {}) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("news")
    .select(PUBLIC_COLUMNS)
    .gte("created_at", hoursAgoIso(windowHours))
    .order("views", { ascending: false })
    .limit(limit);

  const viewsColumnMissing = error?.code === "42703";

  if (!error) {
    return data || [];
  }

  if (!viewsColumnMissing) {
    throw new Error(`getTrendingNews failed: ${error.message}`);
  }

  // `views` doesn't exist yet (Phase 8 hasn't landed) — fall back to recency.
  const { data: fallbackData, error: fallbackError } = await supabase
    .from("news")
    .select(PUBLIC_COLUMNS)
    .gte("created_at", hoursAgoIso(windowHours))
    .order("created_at", { ascending: false })
    .limit(limit);

  if (fallbackError) {
    throw new Error(`getTrendingNews fallback failed: ${fallbackError.message}`);
  }

  return fallbackData || [];
}

/**
 * Distinct list of categories seen in recent articles, for building
 * category navigation. Deduplicated client-side from a bounded recent
 * sample (there's no dedicated categories table yet — see
 * PROJECT_ROADMAP.md's proposed `rss_sources`-adjacent future tables in
 * the bot repo for a possible future improvement here).
 * @returns {Promise<string[]>} Sorted, deduplicated category names.
 */
export async function getCategories() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("news")
    .select("category")
    .not("category", "is", null)
    .order("created_at", { ascending: false })
    .limit(CATEGORY_SAMPLE_SIZE);

  if (error) {
    throw new Error(`getCategories failed: ${error.message}`);
  }

  const unique = [...new Set((data || []).map((row) => row.category).filter(Boolean))];
  return unique.sort((a, b) => a.localeCompare(b));
}

/**
 * Full-text-ish search across the Urdu title/summary and the original
 * English title, using case-insensitive partial matching.
 * @param {string} searchTerm
 * @param {object} [options]
 * @param {number} [options.page=1]
 * @param {number} [options.pageSize=20]
 * @returns {Promise<{items: object[], page: number, pageSize: number, totalCount: number|null, totalPages: number|null}>}
 */
export async function searchNews(searchTerm, { page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  // .or() takes a raw, unsanitized PostgREST filter string — strip
  // characters that have special meaning there (comma separates
  // conditions, parentheses group them) so a search like "hello, world"
  // or "test (1)" can't accidentally break the filter's structure.
  const trimmed = (searchTerm || "").trim().replace(/[,()]/g, " ").replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return toPagedResult([], 0, page, pageSize);
  }

  const supabase = getSupabaseClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const pattern = `%${trimmed}%`;

  const { data, error, count } = await supabase
    .from("news")
    .select(PUBLIC_COLUMNS, { count: "exact" })
    .or(`urdu_title.ilike.${pattern},urdu_summary.ilike.${pattern},title.ilike.${pattern}`)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(`searchNews failed: ${error.message}`);
  }

  return toPagedResult(data, count, page, pageSize);
}

/**
 * A single article for the Article Page, by its database id.
 * (There's no `slug` column yet — URLs like `article.html?id=123` are the
 * simplest approach today. Adding a `slug` column to the bot's schema
 * later would allow pretty URLs without changing this function's shape,
 * just its query.)
 * @param {string|number} id
 * @returns {Promise<object|null>}
 */
export async function getArticleById(id) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("news")
    .select(PUBLIC_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`getArticleById failed: ${error.message}`);
  }

  return data;
}
