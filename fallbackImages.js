/**
 * Topic-relevant fallback cover images when the source has no photo.
 *
 * Rules:
 * - Prefer AI category → curated pool for that topic
 * - If category is vague (Pakistan / General / News) OR unrecognized,
 *   score the English title for a concrete topic (sports, tech, …)
 * - Never fall back to one shared Unsplash for every article
 * - Pools are curated so images match the topic (no random nature shots)
 */

/** Legacy single fallback previously hard-coded. */
export const LEGACY_SHARED_FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1200&h=630&q=80";

const U = (id) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&h=630&q=80`;

/**
 * Curated topic pools (Unsplash). Images should clearly read as that topic.
 */
export const FALLBACK_IMAGE_POOLS = {
  technology: [
    U("photo-1518770660439-4636190af475"),
    U("photo-1519389950473-47ba0277781c"),
    U("photo-1531297482031-56bdf0b3cc3c"),
    U("photo-1488590528505-98d2b5aba04b"),
    U("photo-1550751827-4bd374c3f58b"),
    U("photo-1526374965328-7f61d4dc18c5"),
    U("photo-1581091226825-a6a2a5aee158"),
    U("photo-1555949963-aa79dcee981c"),
    U("photo-1517694712202-14dd9538aa97"),
    U("photo-1486312338219-ce68d2c6f44d")
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
  business: [
    U("photo-1460925895917-afdab827c52f"),
    U("photo-1507679799987-c73779587ccf"),
    U("photo-1554224155-6726b3ff858f"),
    U("photo-1579621970563-ebec7560ff3e"),
    U("photo-1611974789855-9c2a0a7236a3"),
    U("photo-1590283603385-17ffb3a7f29f"),
    U("photo-1454165804606-c3d57bc86b40"),
    U("photo-1486406146926-c627a92ad1ab"),
    U("photo-1526304640581-d334cdbbf45e"),
    U("photo-1556761175-5973dc0f32e7")
  ],
  sports: [
    U("photo-1579952363873-27f3bade9f55"),
    U("photo-1461896836934-ffe607ba6855"),
    U("photo-1517649763962-0c623066027c"),
    U("photo-1552674605-db6ffd4facb5"),
    U("photo-1546519638-68e109498ffc"),
    U("photo-1574629810360-7efbbe195018"),
    U("photo-1431324155629-1a6deb1dec8d"),
    U("photo-1471295253337-3ceaaedca402"),
    U("photo-1531415074968-036ba1b575da"),
    U("photo-1540747913346-19e32dc3e97e")
  ],
  world: [
    U("photo-1521295121783-8a321d551ad2"),
    U("photo-1451187580459-43490279c0fa"),
    U("photo-1529107386315-e1a2ed48a620"),
    U("photo-1495020689067-958852a7765e"),
    U("photo-1504711434969-e33886168f5c"),
    U("photo-1585829365295-ab7cd400c167"),
    U("photo-1503694978374-8a3c242346ad"),
    U("photo-1432821596592-e2c18b78144f"),
    U("photo-1523995462485-3d171b5c8fa9"),
    U("photo-1566378246598-5b11a0d486cc")
  ],
  politics: [
    U("photo-1529107386315-e1a2ed48a620"),
    U("photo-1541872703-74c5e44368f9"),
    U("photo-1523995462485-3d171b5c8fa9"),
    U("photo-1494178270175-e96de2971df9"),
    U("photo-1555848962-6e79363ec58f"),
    U("photo-1582213782179-e0d53f98f2ca"),
    U("photo-1521791136064-7986c2920216"),
    U("photo-1450101499163-c8848c66ca85")
  ],
  entertainment: [
    U("photo-1489599849927-2ee91cede3ba"),
    U("photo-1517604931442-7e0c8ed2963c"),
    U("photo-1598899134739-24c46f58b8c0"),
    U("photo-1478720568477-152d9b3e53f4"),
    U("photo-1493225457124-a3eb161ffa5f"),
    U("photo-1511671782779-c97d3d27a1d4"),
    U("photo-1514525253161-7a46d19cd819"),
    U("photo-1603190287605-e6ade32fa852")
  ],
  health: [
    U("photo-1576091160399-112ba8d25d1d"),
    U("photo-1584820927498-cfe5211fd8bf"),
    U("photo-1579684385127-1ef15d508118"),
    U("photo-1538108149393-fbbd81895907"),
    U("photo-1581595220892-b0739db3b8c5"),
    U("photo-1631217868264-e5b90bb7e133"),
    U("photo-1579154204601-01588f351e67"),
    U("photo-1582719471384-894fbb16e074")
  ],
  education: [
    U("photo-1503676260728-1c00da094a0b"),
    U("photo-1523050854058-8df90110c9f1"),
    U("photo-1497633762265-9d179a990aa6"),
    U("photo-1481627834876-b7833e1bd1d0"),
    U("photo-1524995997946-a1c2e315a42f"),
    U("photo-1427504494785-3a9ca7044f45"),
    U("photo-1509062522246-3755977927d7"),
    U("photo-1580582932707-520aed937b7b")
  ],
  pakistan: [
    U("photo-1596422846543-75c6fc710e32"),
    U("photo-1564507592333-c606f821736b"),
    U("photo-1548013146-72479768bada"),
    U("photo-1524492412937-b28074a5d7da"),
    U("photo-1587474260584-136574528ed5"),
    U("photo-1495020689067-958852a7765e"),
    U("photo-1504711434969-e33886168f5c"),
    U("photo-1585829365295-ab7cd400c167")
  ],
  default: [
    U("photo-1495020689067-958852a7765e"),
    U("photo-1504711434969-e33886168f5c"),
    U("photo-1585829365295-ab7cd400c167"),
    U("photo-1503694978374-8a3c242346ad"),
    U("photo-1432821596592-e2c18b78144f"),
    U("photo-1566378246598-5b11a0d486cc"),
    U("photo-1504384764586-bb4cdc1707b0"),
    U("photo-1475724017904-b712052c192a")
  ]
};

/** Categories that are too broad — refine with title keywords when possible. */
const VAGUE_CATEGORIES = new Set(["default", "pakistan", "general", "news", "local"]);

/**
 * Keyword → topic scoring for English headlines.
 */
const TOPIC_KEYWORDS = [
  {
    topic: "sports",
    weight: 3,
    words: [
      "cricket",
      "football",
      "soccer",
      "tennis",
      "hockey",
      "olympics",
      "match",
      "tournament",
      "fifa",
      "pcb",
      "icc",
      "goal",
      "batting",
      "bowler",
      "stadium",
      "premier league",
      "world cup",
      "athlete",
      "coach"
    ]
  },
  {
    topic: "technology",
    weight: 3,
    words: [
      "tech",
      "technology",
      "iphone",
      "android",
      "google",
      "apple",
      "microsoft",
      "software",
      "app",
      "cyber",
      "chip",
      "semiconductor",
      "startup",
      "gadget",
      "laptop",
      "smartphone",
      "5g",
      "internet",
      "blockchain"
    ]
  },
  {
    topic: "ai",
    weight: 4,
    words: [
      "artificial intelligence",
      "machine learning",
      "chatgpt",
      "openai",
      "generative ai",
      "neural",
      "llm",
      "deep learning"
    ]
  },
  {
    topic: "business",
    weight: 3,
    words: [
      "business",
      "economy",
      "economic",
      "finance",
      "financial",
      "stock",
      "market",
      "inflation",
      "rupee",
      "dollar",
      "bank",
      "trade",
      "imf",
      "gdp",
      "investment",
      "revenue",
      "profit"
    ]
  },
  {
    topic: "politics",
    weight: 3,
    words: [
      "politic",
      "election",
      "minister",
      "parliament",
      "government",
      "cabinet",
      "prime minister",
      "president",
      "senate",
      "assembly",
      "vote",
      "party",
      "coalition",
      "opposition"
    ]
  },
  {
    topic: "entertainment",
    weight: 3,
    words: [
      "film",
      "movie",
      "bollywood",
      "lollywood",
      "celebrity",
      "actor",
      "actress",
      "drama",
      "music",
      "concert",
      "netflix",
      "showbiz",
      "entertainment"
    ]
  },
  {
    topic: "health",
    weight: 3,
    words: [
      "health",
      "hospital",
      "doctor",
      "medical",
      "vaccine",
      "covid",
      "disease",
      "patient",
      "clinic",
      "virus"
    ]
  },
  {
    topic: "education",
    weight: 3,
    words: [
      "education",
      "school",
      "university",
      "student",
      "exam",
      "college",
      "teacher",
      "curriculum",
      "hec"
    ]
  },
  {
    topic: "world",
    weight: 2,
    words: [
      "war",
      "ukraine",
      "gaza",
      "israel",
      "nato",
      "global",
      "international",
      "foreign",
      "embassy",
      "conflict",
      "ceasefire"
    ]
  }
];

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

  const aliases = {
    tech: "technology",
    technology: "technology",
    science: "technology",
    gadget: "technology",
    gadgets: "technology",
    software: "technology",
    cyber: "technology",
    ai: "ai",
    "artificial intelligence": "ai",
    business: "business",
    economy: "business",
    finance: "business",
    markets: "business",
    market: "business",
    sports: "sports",
    sport: "sports",
    cricket: "sports",
    football: "sports",
    world: "world",
    international: "world",
    global: "world",
    politics: "politics",
    political: "politics",
    government: "politics",
    entertainment: "entertainment",
    celebrity: "entertainment",
    showbiz: "entertainment",
    film: "entertainment",
    movies: "entertainment",
    health: "health",
    medical: "health",
    healthcare: "health",
    education: "education",
    pakistan: "pakistan",
    local: "pakistan",
    national: "pakistan"
  };
  if (aliases[raw]) return aliases[raw];

  if (/\b(ai|artificial intelligence|machine learning)\b/.test(raw)) return "ai";
  if (/\b(tech|technology|science|gadget|software|cyber)\b/.test(raw)) return "technology";
  if (/\b(business|economy|finance|market|stock|trade|money)\b/.test(raw)) return "business";
  if (/\b(sport|sports|cricket|football|tennis|hockey)\b/.test(raw)) return "sports";
  if (/\b(politic|election|government|parliament|minister)\b/.test(raw)) return "politics";
  if (/\b(entertain|celebrity|bollywood|lollywood|film|movie|music)\b/.test(raw)) {
    return "entertainment";
  }
  if (/\b(health|medical|hospital|covid|disease)\b/.test(raw)) return "health";
  if (/\b(educat|school|university|student|college)\b/.test(raw)) return "education";
  if (/\b(pakistan|pakistani|karachi|lahore|islamabad)\b/.test(raw)) return "pakistan";
  if (/\b(world|global|international|foreign)\b/.test(raw)) return "world";
  if (Object.prototype.hasOwnProperty.call(FALLBACK_IMAGE_POOLS, raw)) return raw;
  return "default";
}

/**
 * Score English title (and optional source name) for the best topic pool.
 * @param {string} [title]
 * @param {string} [sourceName]
 * @returns {{ topic: string, score: number }}
 */
export function scoreTitleTopic(title = "", sourceName = "") {
  const text = ` ${String(title || "")} ${String(sourceName || "")} `.toLowerCase();
  let best = { topic: "default", score: 0 };

  for (const entry of TOPIC_KEYWORDS) {
    let score = 0;
    for (const word of entry.words) {
      if (text.includes(word.toLowerCase())) {
        score += entry.weight;
      }
    }
    if (score > best.score) {
      best = { topic: entry.topic, score };
    }
  }
  return best;
}

/**
 * Lightweight title/source keyword guess when AI category isn't available yet.
 * @param {string} [title]
 * @param {string} [sourceName]
 */
export function guessFallbackCategory(title = "", sourceName = "") {
  const scored = scoreTitleTopic(title, sourceName);
  return scored.score > 0 ? scored.topic : "default";
}

/**
 * Resolve the best pool key for this article.
 * @param {{ title?: string, category?: string, sourceName?: string }} opts
 * @returns {{ category: string, via: string }}
 */
export function resolveFallbackCategory(opts = {}) {
  const fromAi = normalizeFallbackCategory(opts.category);
  const fromTitle = scoreTitleTopic(opts.title, opts.sourceName);

  // Vague AI labels (Pakistan / General) → prefer a concrete title topic.
  if (VAGUE_CATEGORIES.has(fromAi) && fromTitle.score > 0) {
    return { category: fromTitle.topic, via: "title" };
  }

  if (fromAi !== "default" && !VAGUE_CATEGORIES.has(fromAi)) {
    // Strong title signal can override a weak/mismatched AI label
    // (e.g. AI said World but headline is clearly cricket).
    if (fromTitle.score >= 6 && fromTitle.topic !== fromAi) {
      return { category: fromTitle.topic, via: "title_override" };
    }
    return { category: fromAi, via: "ai_category" };
  }

  if (fromTitle.score > 0) {
    return { category: fromTitle.topic, via: "title" };
  }

  if (fromAi === "pakistan") {
    return { category: "pakistan", via: "ai_category" };
  }

  return { category: "default", via: "default" };
}

/**
 * Pick a topic-relevant stock cover for this article.
 * @param {{ title?: string, link?: string, category?: string, sourceName?: string }} opts
 * @returns {string}
 */
export function pickUniqueFallbackImage(opts = {}) {
  return pickUniqueFallbackImageDetailed(opts).imageUrl;
}

/**
 * Same as pickUniqueFallbackImage but also returns the resolved pool key.
 * @param {{ title?: string, link?: string, category?: string, sourceName?: string }} opts
 * @returns {{ imageUrl: string, category: string, via: string }}
 */
export function pickUniqueFallbackImageDetailed(opts = {}) {
  const resolved = resolveFallbackCategory(opts);
  const pool = FALLBACK_IMAGE_POOLS[resolved.category] || FALLBACK_IMAGE_POOLS.default;
  const seed = `${opts.title || ""}|${opts.link || ""}|${resolved.category}`;
  const index = stableHash(seed) % pool.length;
  return {
    imageUrl: pool[index],
    category: resolved.category,
    via: resolved.via
  };
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
