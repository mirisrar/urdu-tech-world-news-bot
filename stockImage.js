/**
 * Dynamic topic stock images from Unsplash / Pexels when the article
 * has no original cover. No hard-coded single default image.
 *
 * Requires at least one of:
 *   UNSPLASH_ACCESS_KEY  (Unsplash Developers → Access Key)
 *   PEXELS_API_KEY       (Pexels API key)
 *
 * STOCK_IMAGE_PROVIDER = auto | unsplash | pexels  (default auto)
 */

import { resolveFallbackCategory } from "./fallbackImages.js";
import { stableHash } from "./fallbackImages.js";

const UNSPLASH_SEARCH_URL = "https://api.unsplash.com/search/photos";
const PEXELS_SEARCH_URL = "https://api.pexels.com/v1/search";
const FETCH_TIMEOUT_MS = 8000;

/** English search queries per topic pool key. */
const TOPIC_QUERIES = {
  technology: "technology computer laptop circuit board",
  ai: "artificial intelligence robot neural network",
  business: "business finance stock market office",
  sports: "sports stadium athlete cricket football",
  world: "world news globe international journalism",
  politics: "politics government parliament election",
  entertainment: "cinema movie entertainment concert",
  health: "healthcare hospital medical doctor",
  education: "education school university students books",
  pakistan: "pakistan karachi lahore mosque south asia city",
  default: "breaking news journalism newspaper press"
};

function envProvider() {
  const raw = String(process.env.STOCK_IMAGE_PROVIDER || "auto").toLowerCase().trim();
  if (raw === "unsplash" || raw === "pexels" || raw === "auto") return raw;
  return "auto";
}

/**
 * Build a short search query from category + title topic.
 * @param {{ title?: string, category?: string, sourceName?: string }} opts
 */
export function buildStockImageQuery(opts = {}) {
  const resolved = resolveFallbackCategory(opts);
  const base = TOPIC_QUERIES[resolved.category] || TOPIC_QUERIES.default;

  // Light title spice: keep 1–2 distinctive words (helps uniqueness, stays on-topic).
  const titleWords = String(opts.title || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 5)
    .slice(0, 2);

  const query = [base, ...titleWords].join(" ").trim();
  return { query, category: resolved.category, via: resolved.via };
}

async function fetchJson(url, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...headers
      }
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status}: ${body.slice(0, 160)}`);
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} query
 * @param {string} seed
 * @returns {Promise<{ imageUrl: string, provider: "unsplash", photographer?: string }|null>}
 */
export async function searchUnsplash(query, seed = "") {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;

  const url = new URL(UNSPLASH_SEARCH_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", "8");
  url.searchParams.set("orientation", "landscape");
  url.searchParams.set("content_filter", "high");

  const data = await fetchJson(url.toString(), {
    Authorization: `Client-ID ${key}`
  });

  const results = Array.isArray(data?.results) ? data.results : [];
  if (results.length === 0) return null;

  const pick = results[stableHash(seed || query) % results.length];
  const imageUrl =
    pick?.urls?.regular ||
    pick?.urls?.full ||
    pick?.urls?.small ||
    "";
  if (!imageUrl) return null;

  return {
    imageUrl,
    provider: "unsplash",
    photographer: pick?.user?.name || ""
  };
}

/**
 * @param {string} query
 * @param {string} seed
 * @returns {Promise<{ imageUrl: string, provider: "pexels", photographer?: string }|null>}
 */
export async function searchPexels(query, seed = "") {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;

  const url = new URL(PEXELS_SEARCH_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", "8");
  url.searchParams.set("orientation", "landscape");

  const data = await fetchJson(url.toString(), {
    Authorization: key
  });

  const results = Array.isArray(data?.photos) ? data.photos : [];
  if (results.length === 0) return null;

  const pick = results[stableHash(seed || query) % results.length];
  const imageUrl =
    pick?.src?.large2x ||
    pick?.src?.large ||
    pick?.src?.medium ||
    "";
  if (!imageUrl) return null;

  return {
    imageUrl,
    provider: "pexels",
    photographer: pick?.photographer || ""
  };
}

/**
 * Fetch a topic-relevant stock image from Unsplash and/or Pexels.
 *
 * @param {{ title?: string, category?: string, sourceName?: string, link?: string }} opts
 * @param {(level: string, message: string, meta?: object) => void} [log]
 * @returns {Promise<{ imageUrl: string, provider: string, category: string, query: string }|null>}
 */
export async function fetchTopicStockImage(opts = {}, log = () => {}) {
  const provider = envProvider();
  const { query, category, via } = buildStockImageQuery(opts);
  const seed = `${opts.title || ""}|${opts.link || ""}|${category}`;

  const order =
    provider === "unsplash"
      ? ["unsplash"]
      : provider === "pexels"
        ? ["pexels"]
        : ["unsplash", "pexels"];

  for (const name of order) {
    try {
      const result =
        name === "unsplash" ? await searchUnsplash(query, seed) : await searchPexels(query, seed);
      if (!result?.imageUrl) {
        log("info", `Stock image: no ${name} results`, { query, category });
        continue;
      }
      log("info", "Stock image fetched for topic", {
        provider: result.provider,
        category,
        via,
        query,
        photographer: result.photographer || null,
        imageUrl: result.imageUrl.slice(0, 100)
      });
      return {
        imageUrl: result.imageUrl,
        provider: result.provider,
        category,
        query
      };
    } catch (error) {
      log("warn", `Stock image ${name} search failed`, {
        query,
        message: error.name === "AbortError" ? "timeout" : error.message
      });
    }
  }

  return null;
}

/** True if at least one stock image API key is configured. */
export function hasStockImageProvider() {
  return Boolean(process.env.UNSPLASH_ACCESS_KEY || process.env.PEXELS_API_KEY);
}
