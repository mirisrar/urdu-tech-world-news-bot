/**
 * Content + original-image fetcher.
 *
 * - Pulls richest RSS/NewsAPI text for the AI Urdu rewrite.
 * - Extracts the REAL article image from RSS media tags / enclosure /
 *   HTML, then (if needed) from the article page's og:image /
 *   twitter:image. Never generates AI images.
 */

import Parser from "rss-parser";
import {
  LEGACY_SHARED_FALLBACK_IMAGE,
  pickUniqueFallbackImageDetailed
} from "./fallbackImages.js";

const parser = new Parser({
  customFields: {
    item: [
      ["content:encoded", "contentEncoded"],
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
      ["media:group", "mediaGroup", { keepArray: true }]
    ]
  }
});

const MAX_RAW_CONTENT_CHARS = 6000;
const PAGE_FETCH_TIMEOUT_MS = 8000;

/**
 * @deprecated Prefer pickUniqueFallbackImage() — kept only so older imports /
 * imagePipeline skip-checks for the *legacy shared* URL still resolve.
 */
export const DEFAULT_NEWS_PLACEHOLDER_IMAGE =
  process.env.DEFAULT_FALLBACK_IMAGE_URL || LEGACY_SHARED_FALLBACK_IMAGE;

const USER_AGENT =
  "Mozilla/5.0 (compatible; NexoraNewsBot/1.0; +https://github.com/mirisrar/urdu-tech-world-news-bot)";

/**
 * Strip tags / collapse whitespace so Gemini gets clean text, not HTML soup.
 * @param {string} htmlOrText
 * @returns {string}
 */
export function stripHtml(htmlOrText) {
  if (!htmlOrText || typeof htmlOrText !== "string") return "";
  return htmlOrText
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string} value
 * @returns {string}
 */
export function normalizeImageUrl(value) {
  if (!value || typeof value !== "string") return "";
  let url = value.trim().replace(/^<|>$/g, "").replace(/&amp;/g, "&");
  if (!url) return "";
  if (url.startsWith("//")) url = `https:${url}`;
  if (!/^https?:\/\//i.test(url)) return "";
  // Skip tracking pixels / tiny icons when obvious from path.
  if (/\.(svg)(\?|$)/i.test(url) && /sprite|icon|logo/i.test(url)) return "";
  return url;
}

function firstAttr(node, ...keys) {
  if (!node) return "";
  if (typeof node === "string") return normalizeImageUrl(node);
  for (const key of keys) {
    if (node[key]) return normalizeImageUrl(String(node[key]));
    if (node.$?.[key]) return normalizeImageUrl(String(node.$[key]));
  }
  return "";
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Pull image candidates from RSS media / enclosure / inline HTML.
 * @param {object} item - rss-parser item
 * @returns {string[]}
 */
export function extractRssImageCandidates(item) {
  const urls = [];

  const push = (u) => {
    const n = normalizeImageUrl(u);
    if (n && !urls.includes(n)) urls.push(n);
  };

  // <enclosure url="..." type="image/..." />
  if (item.enclosure?.url && (!item.enclosure.type || /^image\//i.test(item.enclosure.type))) {
    push(item.enclosure.url);
  }
  for (const enc of asArray(item.enclosures)) {
    if (enc?.url && (!enc.type || /^image\//i.test(enc.type))) push(enc.url);
  }

  // <media:content url="..." /> / <media:thumbnail url="..." />
  for (const media of asArray(item.mediaContent)) {
    push(firstAttr(media, "url", "href"));
  }
  for (const thumb of asArray(item.mediaThumbnail)) {
    push(firstAttr(thumb, "url", "href"));
  }
  for (const group of asArray(item.mediaGroup)) {
    for (const media of asArray(group?.["media:content"] || group?.mediaContent)) {
      push(firstAttr(media, "url", "href"));
    }
    for (const thumb of asArray(group?.["media:thumbnail"] || group?.mediaThumbnail)) {
      push(firstAttr(thumb, "url", "href"));
    }
  }

  // Some parsers flatten itunes/media onto item
  push(item["media:thumbnail"]?.$.url || item["media:thumbnail"]?.url);
  push(item["media:content"]?.$.url || item["media:content"]?.url);

  // <img src> inside content:encoded / content / summary
  const htmlBlobs = [
    item.contentEncoded,
    item["content:encoded"],
    item.content,
    item.summary,
    item.description
  ].filter((v) => typeof v === "string");

  for (const html of htmlBlobs) {
    const imgRe = /<img[^>]+src=["']([^"']+)["']/gi;
    let match;
    while ((match = imgRe.exec(html)) !== null) {
      push(match[1]);
    }
  }

  return urls;
}

/**
 * Parse og:image / twitter:image (and a few cousins) from HTML.
 * @param {string} html
 * @param {string} [baseUrl]
 * @returns {string}
 */
export function extractMetaImageFromHtml(html, baseUrl = "") {
  if (!html || typeof html !== "string") return "";

  const patterns = [
    /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image:secure_url["']/i,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i
  ];

  for (const re of patterns) {
    const match = html.match(re);
    if (!match?.[1]) continue;
    let url = normalizeImageUrl(match[1]);
    if (!url && baseUrl && match[1].startsWith("/")) {
      try {
        url = normalizeImageUrl(new URL(match[1], baseUrl).toString());
      } catch {
        url = "";
      }
    }
    if (url) return url;
  }

  return "";
}

/**
 * Fetch an article page and return og/twitter image URL (follows redirects).
 * @param {string} articleUrl
 * @param {(level: string, message: string, meta?: object) => void} [log]
 * @returns {Promise<string>}
 */
export async function fetchOgImageFromPage(articleUrl, log = () => {}) {
  const url = normalizeImageUrl(articleUrl) || String(articleUrl || "").trim();
  if (!url || !/^https?:\/\//i.test(url)) return "";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"
      }
    });

    if (!response.ok) {
      log("warn", "Article page fetch failed for image extraction", {
        url,
        status: response.status
      });
      return "";
    }

    const contentType = response.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType) && contentType) {
      // Might have landed on a direct image after redirects.
      if (/^image\//i.test(contentType)) {
        return normalizeImageUrl(response.url || url);
      }
      return "";
    }

    // Only need <head> — cap download size.
    const reader = response.body?.getReader?.();
    let html = "";
    if (reader) {
      const decoder = new TextDecoder("utf-8");
      while (html.length < 200_000) {
        const { done, value } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
        if (/<\/head>/i.test(html)) break;
      }
      try {
        reader.cancel();
      } catch {
        /* ignore */
      }
    } else {
      html = await response.text();
    }

    const finalUrl = response.url || url;
    return extractMetaImageFromHtml(html, finalUrl);
  } catch (error) {
    log("warn", "OG image extraction error", {
      url,
      message: error.name === "AbortError" ? "timeout" : error.message
    });
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pull non-Google publisher links from RSS HTML (Google News descriptions
 * often embed the real article URL).
 * @param {string} html
 * @returns {string[]}
 */
export function extractPublisherLinksFromHtml(html) {
  if (!html || typeof html !== "string") return [];
  const urls = [];
  const re = /href=["'](https?:\/\/[^"']+)["']/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const url = normalizeImageUrl(match[1]) || String(match[1] || "").trim();
    if (!url || !/^https?:\/\//i.test(url)) continue;
    if (/news\.google\.com|google\.com\/url|googleapis\.com|gstatic\.com/i.test(url)) continue;
    if (!urls.includes(url)) urls.push(url);
  }
  return urls;
}

/**
 * Resolve the best original article image for an item.
 * Order: RSS media/enclosure/img → page og:image/twitter:image
 * → unique category/hash stock fallback (never one shared Unsplash for all).
 *
 * @param {{
 *   link?: string,
 *   title?: string,
 *   imageHint?: string,
 *   imageCandidates?: string[],
 *   rawHtml?: string,
 *   description?: string
 * }} item
 * @param {(level: string, message: string, meta?: object) => void} [log]
 * @param {{ category?: string, sourceName?: string, allowPlaceholder?: boolean }} [options]
 * @returns {Promise<{ imageUrl: string, source: "rss"|"meta"|"placeholder"|"none" }>}
 */
export async function resolveArticleImage(item, log = () => {}, options = {}) {
  const candidates = [
    ...(item.imageCandidates || []),
    item.imageHint,
    ...extractRssImageCandidates({
      content: item.rawHtml,
      description: item.rawHtml
    })
  ]
    .map(normalizeImageUrl)
    .filter(Boolean);

  const unique = [...new Set(candidates)];
  if (unique[0]) {
    return { imageUrl: unique[0], source: "rss" };
  }

  const pageCandidates = [];
  if (item.link) pageCandidates.push(item.link);
  for (const pub of extractPublisherLinksFromHtml(item.rawHtml || item.description || "")) {
    pageCandidates.push(pub);
  }

  const tried = new Set();
  for (const pageUrl of pageCandidates) {
    const key = String(pageUrl || "").trim();
    if (!key || tried.has(key)) continue;
    tried.add(key);

    const og = await fetchOgImageFromPage(key, log);
    if (og) {
      return { imageUrl: og, source: "meta" };
    }
  }

  const allowPlaceholder = options.allowPlaceholder !== false;
  if (!allowPlaceholder) {
    log("info", "No original article image found (RSS/og/publisher) — no placeholder", {
      title: item.title
    });
    return { imageUrl: "", source: "none" };
  }

  const picked = pickUniqueFallbackImageDetailed({
    title: item.title,
    link: item.link,
    category: options.category,
    sourceName: options.sourceName
  });

  log("info", "No original article image — using topic-relevant category fallback", {
    title: item.title,
    aiCategory: options.category || null,
    fallbackCategory: picked.category,
    via: picked.via,
    imageUrl: picked.imageUrl.slice(0, 100)
  });

  return { imageUrl: picked.imageUrl, source: "placeholder" };
}

export {
  isLegacySharedFallback,
  pickUniqueFallbackImageDetailed
} from "./fallbackImages.js";
export { pickUniqueFallbackImage } from "./fallbackImages.js";

/**
 * Pick the longest useful text blob from common RSS item fields.
 * @param {object} item - rss-parser item
 * @returns {{ description: string, rawContent: string }}
 */
export function extractRssText(item) {
  const candidates = [
    item.contentEncoded,
    item["content:encoded"],
    item.content,
    item.summary,
    item.contentSnippet,
    item.description
  ]
    .map(stripHtml)
    .filter((text) => text.length > 0);

  candidates.sort((a, b) => b.length - a.length);
  const rawContent = (candidates[0] || "").slice(0, MAX_RAW_CONTENT_CHARS);
  const description = stripHtml(item.contentSnippet || item.description || "").slice(0, 500);

  return { description, rawContent: rawContent || description };
}

/**
 * Normalize a NewsAPI article into the shared collector item shape.
 */
export function normalizeNewsApiArticle(article) {
  const description = stripHtml(article.description || "");
  const content = stripHtml(article.content || "");
  const rawContent = (content.length >= description.length ? content : description).slice(
    0,
    MAX_RAW_CONTENT_CHARS
  );
  const imageHint = normalizeImageUrl(article.urlToImage || "");

  return {
    title: (article.title || "").trim(),
    link: article.url || "",
    description,
    rawContent: rawContent || description,
    imageHint,
    imageCandidates: imageHint ? [imageHint] : [],
    publisher: ""
  };
}

/**
 * Google News titles are usually "Headline - Publisher".
 */
export function parseGoogleNewsTitle(title) {
  const raw = String(title || "").trim();
  const match = raw.match(/^(.*?)\s+-\s+(.+)$/);
  if (!match) {
    return { headline: raw, publisher: "" };
  }
  return { headline: match[1].trim(), publisher: match[2].trim() };
}

/**
 * Normalize an RSS item into the shared collector item shape.
 */
export function normalizeRssItem(item, options = {}) {
  const { description, rawContent } = extractRssText(item);
  let title = (item.title || "").trim();
  let publisher = "";

  if (options.googleNews) {
    const parsed = parseGoogleNewsTitle(title);
    title = parsed.headline || title;
    publisher = parsed.publisher;
  }

  const imageCandidates = extractRssImageCandidates(item);

  return {
    title,
    link: item.link || item.guid || "",
    description,
    rawContent,
    imageHint: imageCandidates[0] || "",
    imageCandidates,
    rawHtml: item.contentEncoded || item.content || item.description || "",
    publisher
  };
}

/**
 * Fetch and normalize items from one RSS feed URL.
 */
export async function fetchRssFeed(feedUrl, limit = 3, options = {}) {
  const feed = await parser.parseURL(feedUrl);
  const items = (feed.items || []).slice(0, limit).map((item) => normalizeRssItem(item, options));
  return { feedTitle: feed.title || "", items };
}

/**
 * True when we have enough source text for a full Urdu rewrite.
 */
export function hasUsableSourceText(item) {
  const text = item.rawContent || item.description || "";
  return text.trim().length >= 40 || Boolean(item.title?.trim());
}
