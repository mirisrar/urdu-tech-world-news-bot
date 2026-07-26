/**
 * Content fetcher / normalizer (JS equivalent of fetcher.py).
 *
 * Goal: give the AI agent enough raw English source text to write a full
 * Urdu article — not just a headline. Pulls the richest available field
 * from RSS (content:encoded → content → summary → contentSnippet →
 * description) and from NewsAPI (content → description).
 */

import Parser from "rss-parser";

const parser = new Parser({
  // Many feeds put the full body in content:encoded.
  customFields: {
    item: [["content:encoded", "contentEncoded"]]
  }
});

const MAX_RAW_CONTENT_CHARS = 6000;

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

  // Prefer the longest non-trivial blob (full article > teaser).
  candidates.sort((a, b) => b.length - a.length);
  const rawContent = (candidates[0] || "").slice(0, MAX_RAW_CONTENT_CHARS);
  const description = stripHtml(item.contentSnippet || item.description || "").slice(0, 500);

  return { description, rawContent: rawContent || description };
}

/**
 * Normalize a NewsAPI article into the shared collector item shape.
 * @param {{ title?: string, description?: string, content?: string, url?: string, urlToImage?: string }} article
 */
export function normalizeNewsApiArticle(article) {
  const description = stripHtml(article.description || "");
  const content = stripHtml(article.content || "");
  const rawContent = (content.length >= description.length ? content : description).slice(
    0,
    MAX_RAW_CONTENT_CHARS
  );

  return {
    title: (article.title || "").trim(),
    link: article.url || "",
    description,
    rawContent: rawContent || description,
    imageHint: article.urlToImage || ""
  };
}

/**
 * Google News titles are usually "Headline - Publisher".
 * @param {string} title
 * @returns {{ headline: string, publisher: string }}
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
 * @param {object} item - rss-parser item
 * @param {{ googleNews?: boolean }} [options]
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

  return {
    title,
    link: item.link || item.guid || "",
    description,
    rawContent,
    imageHint: item.enclosure?.url || "",
    publisher
  };
}

/**
 * Fetch and normalize items from one RSS feed URL.
 * @param {string} feedUrl
 * @param {number} [limit=3]
 * @param {{ googleNews?: boolean }} [options]
 * @returns {Promise<{ feedTitle: string, items: ReturnType<typeof normalizeRssItem>[] }>}
 */
export async function fetchRssFeed(feedUrl, limit = 3, options = {}) {
  const feed = await parser.parseURL(feedUrl);
  const items = (feed.items || []).slice(0, limit).map((item) => normalizeRssItem(item, options));
  return { feedTitle: feed.title || "", items };
}

/**
 * True when we have enough source text for a full Urdu rewrite.
 * Short teasers still proceed — the AI expands from headline+snippet —
 * but longer content produces better articles.
 * @param {{ rawContent?: string, description?: string, title?: string }} item
 */
export function hasUsableSourceText(item) {
  const text = item.rawContent || item.description || "";
  return text.trim().length >= 40 || Boolean(item.title?.trim());
}
