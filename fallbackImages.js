/**
 * Unique fallback cover images when the source article has no usable photo.
 *
 * Problem we fix: a single shared Unsplash newspaper URL made every Business
 * (and other) card look identical.
 *
 * Strategy: curated per-category pools + stable hash(title|url) so each
 * article gets a *different* stock cover, but the same article always maps
 * to the same fallback (idempotent retries).
 */

/** Legacy single fallback previously hard-coded / used as DEFAULT_FALLBACK. */
export const LEGACY_SHARED_FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1200&h=630&q=80";

const U = (id) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&h=630&q=80`;

/**
 * Curated pools (Unsplash). Keep lists reasonably long so sections don't
 * visually "repeat" after a handful of posts.
 */
export const FALLBACK_IMAGE_POOLS = {
  business: [
    U("photo-1460925895917-afdab827c52f"),
    U("photo-1507679799987-c73779587ccf"),
    U("photo-1556761175-5973dc0f32e7"),
    U("photo-1554224155-6726b3ff858f"),
    U("photo-1579621970563-ebec7560ff3e"),
    U("photo-1611974789855-9c2a0a7236a3"),
    U("photo-1590283603385-17ffb3a7f29f"),
    U("photo-1454165804606-c3d57bc86b40"),
    U("photo-1486406146926-c627a92ad1ab"),
    U("photo-1526304640581-d334cdbbf45e")
  ],
  technology: [
    U("photo-1518770660439-4636190af475"),
    U("photo-1519389950473-47ba0277781c"),
    U("photo-1531297482031-56bdf0b3cc3c"),
    U("photo-1488590528505-98d2b5aba04b"),
    U("photo-1550751827-4bd374c3f58b"),
    U("photo-1526374965328-7f61d4dc18c5"),
    U("photo-1581091226825-a6a2a5aee158"),
    U("photo-1677442136019-21780ecad995"),
    U("photo-1555949963-aa79dcee981c"),
    U("photo-1517694712202-14dd9538aa97")
  ],
  ai: [
    U("photo-1677442136019-21780ecad995"),
    U("photo-1620712943543-bcc4688e7485"),
    U("photo-1485827404703-89b55fcc595e"),
    U("photo-1531746790176-3ba70f4a95af"),
    U("photo-1555255707-44d423ce18e0"),
    U("photo-1507146426996-ef05306b995a"),
    U("photo-1589254065878-42c3ca74234c"),
    U("photo-1515879218367-8466d910aaa4")
  ],
  world: [
    U("photo-1521295121783-8a321d551ad2"),
    U("photo-1451187580459-43490279c0fa"),
    U("photo-1529107386315-e1a2ed48a620"),
    U("photo-1483728642387-6c3bdd6cf561"),
    U("photo-1495020689067-958852a7765e"),
    U("photo-1446776811953-b23d57bd21aa"),
    U("photo-1504609773096-104ff2c73ba4"),
    U("photo-1469474968028-56623f02e42e"),
    U("photo-1470071459604-3b5ec3a7fe05"),
    U("photo-1526779259212-939e64788e3c")
  ],
  sports: [
    U("photo-1579952363873-27f3bade9f55"),
    U("photo-1461896836934-ffe607ba6855"),
    U("photo-1517649763962-0c623066027c"),
    U("photo-1552674605-db6ffd4facb5"),
    U("photo-1546519638-68e109498ffc"),
    U("photo-1574629810360-7efbbe195018"),
    U("photo-1431324155629-1a6deb1dec8d"),
    U("photo-1471295253337-3ceaaedca402")
  ],
  politics: [
    U("photo-1529107386315-e1a2ed48a620"),
    U("photo-1541872703-74c5e44368f9"),
    U("photo-1523995462485-3d171b5c8fa9"),
    U("photo-1494178270175-e96de2971df9"),
    U("photo-1555848962-6e79363ec58f"),
    U("photo-1582213782179-e0d53f98f2ca"),
    U("photo-1507679799987-c73779587ccf"),
    U("photo-1450101499163-c8848c66ca85")
  ],
  default: [
    U("photo-1495020689067-958852a7765e"),
    U("photo-1585829365295-ab7cd400c167"),
    U("photo-1503694978374-8a3c242346ad"),
    U("photo-1432821596592-e2c18b78144f"),
    U("photo-1475724017904-b712052c192a"),
    U("photo-1457369804613-52c61a468e7d"),
    U("photo-1523995462485-3d171b5c8fa9"),
    U("photo-1566378246598-5b11a0d486cc"),
    U("photo-1504384764586-bb4cdc1707b0"),
    U("photo-1504711434969-e33886168f5c")
  ]
};

/**
 * Stable 32-bit hash for string → pool index.
 * @param {string} input
 * @returns {number}
 */
export function stableHash(input) {
  let hash = 2166136261;
  const str = String(input || "");
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Map AI / free-text category labels onto pool keys.
 * @param {string} [category]
 * @returns {string}
 */
export function normalizeFallbackCategory(category) {
  const raw = String(category || "")
    .toLowerCase()
    .trim();

  if (!raw) return "default";
  if (/\b(ai|artificial intelligence|machine learning)\b/.test(raw) || raw === "ml") return "ai";
  if (/\b(tech|technology|science|gadget|software|cyber)\b/.test(raw)) return "technology";
  if (/\b(business|economy|finance|market|stock|trade|money)\b/.test(raw)) return "business";
  if (/\b(sport|sports|cricket|football|tennis)\b/.test(raw)) return "sports";
  if (/\b(politic|election|government|parliament)\b/.test(raw)) return "politics";
  if (/\b(world|global|international|foreign)\b/.test(raw)) return "world";
  if (Object.prototype.hasOwnProperty.call(FALLBACK_IMAGE_POOLS, raw)) return raw;
  return "default";
}

/**
 * Lightweight title/source keyword guess when AI category isn't available yet.
 * @param {string} [title]
 * @param {string} [sourceName]
 */
export function guessFallbackCategory(title = "", sourceName = "") {
  return normalizeFallbackCategory(`${title} ${sourceName}`);
}

/**
 * Pick a unique-ish stock cover for this article.
 *
 * @param {{ title?: string, link?: string, category?: string, sourceName?: string }} opts
 * @returns {string}
 */
export function pickUniqueFallbackImage(opts = {}) {
  const fromAi = normalizeFallbackCategory(opts.category);
  const category =
    fromAi !== "default" ? fromAi : guessFallbackCategory(opts.title, opts.sourceName);

  const pool = FALLBACK_IMAGE_POOLS[category] || FALLBACK_IMAGE_POOLS.default;
  const seed = `${opts.title || ""}|${opts.link || ""}|${category}`;
  const index = stableHash(seed) % pool.length;
  return pool[index];
}

/**
 * True if URL is the old shared newspaper Unsplash (or env override of it).
 * @param {string} [url]
 */
export function isLegacySharedFallback(url) {
  const value = String(url || "");
  if (!value) return false;
  if (value.includes("photo-1504711434969-e33886168f5c")) return true;
  const envFallback = process.env.DEFAULT_FALLBACK_IMAGE_URL || "";
  return Boolean(envFallback) && value === envFallback;
}

/**
 * Flat list of every pool URL (for tests / helpers).
 */
export function allFallbackPoolUrls() {
  return [...new Set(Object.values(FALLBACK_IMAGE_POOLS).flat())];
}
