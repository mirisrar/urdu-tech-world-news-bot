/**
 * Phase 10 — SEO Foundation helpers for Nexora News Urdu.
 *
 * Builds + applies <title>, meta description, Open Graph, Twitter Card,
 * and canonical from a `news` row (or a plain page descriptor).
 *
 * Note: client-side meta updates help browsers and some scrapers. Facebook /
 * Google crawlers prefer tags present in the first HTML response — Phase 13
 * (static/SSR) hardens that. Until then, still call apply* so shares that
 * execute JS (and human View Source after load) are correct.
 */

import { articleUrl, excerpt, resolveImageUrl } from "./utils.js";

export const DEFAULT_SITE_NAME = "Nexora News Urdu";
export const DEFAULT_OG_LOCALE = "ur_PK";

/**
 * @typedef {object} SeoPayload
 * @property {string} title
 * @property {string} description
 * @property {string} image
 * @property {string} url
 * @property {string} [type]
 * @property {string} [siteName]
 * @property {string} [locale]
 * @property {string} [canonical]
 */

/**
 * Resolve site origin (no trailing slash). Prefer explicit option, then
 * config SITE_ORIGIN, then browser location.origin.
 * @param {string} [explicit]
 * @param {{ SITE_ORIGIN?: string }} [config]
 */
export function resolveSiteOrigin(explicit, config) {
  const fromArg = String(explicit || "").trim().replace(/\/+$/, "");
  if (fromArg) return fromArg;

  const configOrigin = String(config?.SITE_ORIGIN || "")
    .trim()
    .replace(/\/+$/, "");
  if (configOrigin) return configOrigin;

  if (typeof location !== "undefined" && location?.origin) {
    return String(location.origin).replace(/\/+$/, "");
  }
  return "";
}

/**
 * Turn a path or absolute URL into an absolute https? URL when origin known.
 * @param {string} pathOrUrl
 * @param {string} [siteOrigin]
 */
export function toAbsoluteUrl(pathOrUrl, siteOrigin = "") {
  const raw = String(pathOrUrl || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;

  const origin = String(siteOrigin || "").replace(/\/+$/, "");
  if (!origin) return raw;

  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return `${origin}${path}`;
}

/**
 * Build the document <title> string.
 * @param {string} pageTitle
 * @param {string} [siteName]
 */
export function formatDocumentTitle(pageTitle, siteName = DEFAULT_SITE_NAME) {
  const title = String(pageTitle || "").trim();
  const brand = String(siteName || DEFAULT_SITE_NAME).trim();
  if (!title) return brand;
  if (!brand) return title;
  if (title.toLowerCase().includes(brand.toLowerCase())) return title;
  return `${title} — ${brand}`;
}

/**
 * Build SEO fields for a single news article.
 *
 * @param {object} article - row from newsApi (seo_title, urdu_title, …)
 * @param {object} [options]
 * @param {string} [options.siteOrigin]
 * @param {string} [options.siteName]
 * @param {{ SITE_ORIGIN?: string, SITE_NAME?: string }} [options.config]
 * @param {string} [options.locale]
 * @returns {SeoPayload}
 */
export function buildArticleSeo(article, options = {}) {
  const siteName = options.siteName || options.config?.SITE_NAME || DEFAULT_SITE_NAME;
  const siteOrigin = resolveSiteOrigin(options.siteOrigin, options.config);
  const locale = options.locale || DEFAULT_OG_LOCALE;

  const headline = String(
    article?.seo_title || article?.urdu_title || article?.title || ""
  ).trim();
  const description = excerpt(
    String(article?.urdu_summary || article?.article || "").trim(),
    160
  );
  const path = article ? articleUrl(article) : "";
  const url = toAbsoluteUrl(path, siteOrigin);
  const image = toAbsoluteUrl(resolveImageUrl(article?.image_url), siteOrigin);

  return {
    title: formatDocumentTitle(headline, siteName),
    description,
    image,
    url,
    canonical: url,
    type: "article",
    siteName,
    locale
  };
}

/**
 * Build SEO fields for a generic page (home, category, search).
 *
 * @param {object} page
 * @param {string} page.title
 * @param {string} [page.description]
 * @param {string} [page.path] - e.g. "/" or "/index.html"
 * @param {string} [page.image]
 * @param {object} [options] - same as buildArticleSeo options
 * @returns {SeoPayload}
 */
export function buildPageSeo(page, options = {}) {
  const siteName = options.siteName || options.config?.SITE_NAME || DEFAULT_SITE_NAME;
  const siteOrigin = resolveSiteOrigin(options.siteOrigin, options.config);
  const locale = options.locale || DEFAULT_OG_LOCALE;
  const path = page?.path || "/";
  const url = toAbsoluteUrl(path, siteOrigin);
  const image = page?.image
    ? toAbsoluteUrl(page.image, siteOrigin)
    : "";

  return {
    title: formatDocumentTitle(page?.title || siteName, siteName),
    description: excerpt(String(page?.description || "").trim(), 160),
    image,
    url,
    canonical: url,
    type: "website",
    siteName,
    locale
  };
}

/**
 * Upsert a <meta> tag by attribute (name|property) + key.
 * @param {"name"|"property"} attr
 * @param {string} key
 * @param {string} content
 * @param {ParentNode} [head]
 */
export function upsertMeta(attr, key, content, head = document.head) {
  const value = String(content || "").trim();
  if (!value) return null;

  let el = head.querySelector(`meta[${attr}="${escapeAttrSelector(key)}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    head.appendChild(el);
  }
  el.setAttribute("content", value);
  return el;
}

/** @param {string} value */
function escapeAttrSelector(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Upsert <link rel="canonical">.
 * @param {string} href
 * @param {ParentNode} [head]
 */
export function upsertCanonical(href, head = document.head) {
  const value = String(href || "").trim();
  if (!value) return null;

  let el = head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    head.appendChild(el);
  }
  el.setAttribute("href", value);
  return el;
}

/**
 * Apply a SeoPayload to document.head (title, description, OG, Twitter, canonical).
 * @param {SeoPayload} seo
 * @param {Document} [doc]
 */
export function applyDocumentSeo(seo, doc = document) {
  const head = doc.head;
  if (!head || !seo) return;

  const title = String(seo.title || "").trim();
  if (title) doc.title = title;

  upsertMeta("name", "description", seo.description, head);

  upsertMeta("property", "og:title", seo.title, head);
  upsertMeta("property", "og:description", seo.description, head);
  upsertMeta("property", "og:type", seo.type || "website", head);
  upsertMeta("property", "og:locale", seo.locale || DEFAULT_OG_LOCALE, head);
  if (seo.siteName) upsertMeta("property", "og:site_name", seo.siteName, head);
  if (seo.url) upsertMeta("property", "og:url", seo.url, head);
  if (seo.image) upsertMeta("property", "og:image", seo.image, head);

  upsertMeta("name", "twitter:card", seo.image ? "summary_large_image" : "summary", head);
  upsertMeta("name", "twitter:title", seo.title, head);
  upsertMeta("name", "twitter:description", seo.description, head);
  if (seo.image) upsertMeta("name", "twitter:image", seo.image, head);

  upsertCanonical(seo.canonical || seo.url, head);

  // Language / direction — keep consistent with Urdu site.
  if (doc.documentElement) {
    doc.documentElement.setAttribute("lang", "ur");
    doc.documentElement.setAttribute("dir", "rtl");
  }
}

/**
 * Convenience: build + apply article SEO in one call.
 * @param {object} article
 * @param {object} [options]
 * @returns {SeoPayload}
 */
export function applyArticleSeo(article, options = {}) {
  const seo = buildArticleSeo(article, options);
  applyDocumentSeo(seo);
  return seo;
}

/**
 * Convenience: build + apply generic page SEO.
 * @param {object} page
 * @param {object} [options]
 * @returns {SeoPayload}
 */
export function applyPageSeo(page, options = {}) {
  const seo = buildPageSeo(page, options);
  applyDocumentSeo(seo);
  return seo;
}
