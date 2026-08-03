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

import {
  resolveFallbackCategory,
  stableHash,
  textHasTopicKeyword
} from "./fallbackImages.js";

const UNSPLASH_SEARCH_URL = "https://api.unsplash.com/search/photos";
const PEXELS_SEARCH_URL = "https://api.pexels.com/v1/search";
const FETCH_TIMEOUT_MS = 8000;

/** English search queries per topic pool key. */
const TOPIC_QUERIES = {
  technology: "technology computer laptop software office",
  ai: "artificial intelligence robot neural network",
  business: "business finance stock market office",
  sports: "sports stadium athlete cricket football",
  world: "world news globe international journalism",
  politics: "politics government parliament election",
  entertainment: "cinema movie entertainment concert",
  health: "healthcare hospital medical doctor",
  education: "education school university students books",
  // Avoid circuit-board / chip stock for Pakistan news.
  pakistan: "pakistan police security law enforcement south asia",
  default: "breaking news journalism newspaper press"
};

/** Title signals that mean crime / LEA / security — never use tech imagery. */
const SECURITY_TITLE_RE =
  /\b(ctd|fia|isi|raw\b|arrest|ied|terror|police|intelligence|explosive|suspect|raid|ibos|bomb|security forces)\b/i;

/** Stock result metadata that screams "wrong tech photo". */
const TECH_IMAGE_DENY_RE =
  /\b(motherboard|circuit\s*board|printed circuit|cpu|gpu|semiconductor|microchip|chipset|silicon wafer|server rack|data center rack|coding|laptop keyboard|rgb keyboard|graphics card|processor die)\b/i;

/** Words we never append from the title as Unsplash/Pexels spice. */
const TITLE_SPICE_BLOCKLIST = new Set([
  "agents",
  "agent",
  "model",
  "models",
  "chip",
  "chips",
  "cpu",
  "gpu",
  "ai",
  "gpt",
  "robot",
  "robots",
  "software",
  "digital",
  "online",
  "after",
  "before",
  "about",
  "their",
  "there",
  "these",
  "those",
  "could",
  "would",
  "should",
  "against",
  "under",
  "over",
  "with",
  "from",
  "into",
  "that",
  "this",
  "have",
  "been",
  "were",
  "when",
  "what",
  "which",
  "while",
  "where",
  "arrests",
  "arrested",
  "arrest"
]);

function envProvider() {
  const raw = String(process.env.STOCK_IMAGE_PROVIDER || "auto").toLowerCase().trim();
  if (raw === "unsplash" || raw === "pexels" || raw === "auto") return raw;
  return "auto";
}

/**
 * @param {{ title?: string, category?: string }} opts
 */
export function isSecurityOrCrimeArticle(opts = {}) {
  const title = String(opts.title || "");
  if (SECURITY_TITLE_RE.test(title)) return true;
  const category = String(opts.category || "").toLowerCase();
  return category === "pakistan" && /\b(crime|security|police|terror)\b/i.test(title);
}

/**
 * @param {string} [text]
 */
export function looksLikeTechStockImage(text = "") {
  return TECH_IMAGE_DENY_RE.test(String(text || ""));
}

/**
 * Build a short search query from category + title topic.
 * @param {{ title?: string, category?: string, sourceName?: string }} opts
 */
export function buildStockImageQuery(opts = {}) {
  const resolved = resolveFallbackCategory(opts);
  let category = resolved.category;
  let via = resolved.via;

  // Hard guard: CTD/arrest/etc. must never search tech/chip pools.
  if (isSecurityOrCrimeArticle(opts) && (category === "technology" || category === "ai")) {
    category = "pakistan";
    via = "security_guard";
  }

  const base = TOPIC_QUERIES[category] || TOPIC_QUERIES.default;

  const title = String(opts.title || "");
  const titleWords = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !TITLE_SPICE_BLOCKLIST.has(w));

  // Prefer place / org tokens for security stories (Okara, CTD, Punjab…).
  let spice = [];
  if (isSecurityOrCrimeArticle(opts) || category === "pakistan") {
    spice = titleWords
      .filter((w) =>
        /^(ctd|fia|isi|okara|punjab|karachi|lahore|islamabad|peshawar|rawalpindi|quetta|pakistan)$/i.test(
          w
        )
      )
      .slice(0, 3);
    if (spice.length === 0) {
      spice = ["pakistan", "police", "security"];
    }
  } else {
    spice = titleWords.slice(0, 2);
  }

  const query = [...new Set([base, ...spice].join(" ").split(/\s+/))]
    .join(" ")
    .trim();

  return { query, category, via };
}

/**
 * Reject stock hits whose alt/description is clearly off-topic for the article.
 * @param {{ title?: string, category?: string }} article
 * @param {string} metaText
 */
export function isStockImageMismatch(article, metaText) {
  if (!metaText) return false;
  if (looksLikeTechStockImage(metaText) && isSecurityOrCrimeArticle(article)) {
    return true;
  }
  if (
    looksLikeTechStockImage(metaText) &&
    String(article.category || "").toLowerCase() === "pakistan" &&
    !/\b(tech|technology|ai|software|app|cyber|chip)\b/i.test(article.title || "")
  ) {
    return true;
  }
  return false;
}

function stockMetaText(parts = []) {
  return parts.filter(Boolean).join(" ");
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
 * @param {{ title?: string, category?: string }} [article]
 * @returns {Promise<{ imageUrl: string, provider: "unsplash", photographer?: string }|null>}
 */
export async function searchUnsplash(query, seed = "", article = {}) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;

  const url = new URL(UNSPLASH_SEARCH_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", "12");
  url.searchParams.set("orientation", "landscape");
  url.searchParams.set("content_filter", "high");

  const data = await fetchJson(url.toString(), {
    Authorization: `Client-ID ${key}`
  });

  const results = Array.isArray(data?.results) ? data.results : [];
  const usable = results.filter((pick) => {
    const meta = stockMetaText([
      pick?.alt_description,
      pick?.description,
      ...(Array.isArray(pick?.tags) ? pick.tags.map((t) => t?.title) : [])
    ]);
    return !isStockImageMismatch(article, meta);
  });
  if (usable.length === 0) return null;

  const pick = usable[stableHash(seed || query) % usable.length];
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
 * @param {{ title?: string, category?: string }} [article]
 * @returns {Promise<{ imageUrl: string, provider: "pexels", photographer?: string }|null>}
 */
export async function searchPexels(query, seed = "", article = {}) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;

  const url = new URL(PEXELS_SEARCH_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", "12");
  url.searchParams.set("orientation", "landscape");

  const data = await fetchJson(url.toString(), {
    Authorization: key
  });

  const results = Array.isArray(data?.photos) ? data.photos : [];
  const usable = results.filter((pick) => {
    const meta = stockMetaText([pick?.alt, pick?.url]);
    return !isStockImageMismatch(article, meta);
  });
  if (usable.length === 0) return null;

  const pick = usable[stableHash(seed || query) % usable.length];
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
  const article = { title: opts.title, category: opts.category || category };

  const order =
    provider === "unsplash"
      ? ["unsplash"]
      : provider === "pexels"
        ? ["pexels"]
        : ["unsplash", "pexels"];

  // For security stories, prefer the safer query first; if empty, try a stricter second query.
  const queries = [query];
  if (isSecurityOrCrimeArticle(opts) || category === "pakistan") {
    queries.push("pakistan police security law enforcement");
    queries.push("south asia journalism news press conference");
  }

  for (const q of [...new Set(queries)]) {
    for (const name of order) {
      try {
        const result =
          name === "unsplash"
            ? await searchUnsplash(q, seed, article)
            : await searchPexels(q, seed, article);
        if (!result?.imageUrl) {
          log("info", `Stock image: no ${name} results`, { query: q, category });
          continue;
        }
        log("info", "Stock image fetched for topic", {
          provider: result.provider,
          category,
          via,
          query: q,
          photographer: result.photographer || null,
          imageUrl: result.imageUrl.slice(0, 100)
        });
        return {
          imageUrl: result.imageUrl,
          provider: result.provider,
          category,
          query: q,
          photographer: result.photographer || "",
          imageCredit: result.photographer
            ? `Photo: ${result.photographer} / ${
                result.provider === "pexels" ? "Pexels" : "Unsplash"
              }`
            : `Source: ${result.provider === "pexels" ? "Pexels" : "Unsplash"}`
        };
      } catch (error) {
        log("warn", `Stock image ${name} search failed`, {
          query: q,
          message: error.name === "AbortError" ? "timeout" : error.message
        });
      }
    }
  }

  return null;
}

/** True if at least one stock image API key is configured. */
export function hasStockImageProvider() {
  return Boolean(process.env.UNSPLASH_ACCESS_KEY || process.env.PEXELS_API_KEY);
}

// Keep export for tests / callers that previously imported helpers indirectly.
export { textHasTopicKeyword };
