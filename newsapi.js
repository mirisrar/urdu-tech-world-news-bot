/**
 * Small, self-contained client for NewsAPI.org (https://newsapi.org/docs).
 *
 * Kept as its own module (rather than inline in index.js) so it can be
 * unit-tested and reused independently of the RSS-based collector.
 */

const NEWS_API_EVERYTHING_URL = "https://newsapi.org/v2/everything";
const NEWS_API_TOP_HEADLINES_URL = "https://newsapi.org/v2/top-headlines";

/**
 * Fetches news articles from NewsAPI.org for a given query keyword.
 *
 * @param {string} query - Keyword to search for (e.g. "technology"). Required.
 * @param {object} [options]
 * @param {"everything"|"top-headlines"} [options.endpoint="everything"] -
 *   Which NewsAPI endpoint to use. "everything" supports free-text keyword
 *   search across all articles; "top-headlines" is scoped to current
 *   headlines (and accepts `q` as an additional filter on top of category/country).
 * @param {number} [options.pageSize=10] - Number of articles to fetch (1-100).
 * @param {string} [options.language="en"] - Language filter (only applied to "everything").
 * @returns {Promise<Array<{ title: string, description: string, url: string, urlToImage: string }>>}
 * @throws {Error} If `query` is invalid, `NEWS_API_KEY` is not set, the
 *   network request fails, or NewsAPI returns a non-ok / error response.
 */
export async function fetchNewsFromNewsApi(query, options = {}) {
  const { endpoint = "everything", pageSize = 10, language = "en" } = options;

  if (!query || typeof query !== "string" || !query.trim()) {
    throw new Error("fetchNewsFromNewsApi: 'query' must be a non-empty string");
  }

  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "NEWS_API_KEY environment variable is not set. Get a free key at https://newsapi.org and set it before calling fetchNewsFromNewsApi()."
    );
  }

  const baseUrl =
    endpoint === "top-headlines" ? NEWS_API_TOP_HEADLINES_URL : NEWS_API_EVERYTHING_URL;

  const url = new URL(baseUrl);
  url.searchParams.set("q", query.trim());
  url.searchParams.set("pageSize", String(pageSize));
  if (endpoint === "everything") {
    url.searchParams.set("language", language);
    url.searchParams.set("sortBy", "publishedAt");
  }

  let response;
  try {
    response = await fetch(url.toString(), {
      headers: { "X-Api-Key": apiKey }
    });
  } catch (networkError) {
    // e.g. DNS failure, connection refused, timeout — genuinely never reached NewsAPI.
    throw new Error(`NewsAPI request failed (network error): ${networkError.message}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (parseError) {
    throw new Error(
      `NewsAPI returned a non-JSON response (HTTP ${response.status}): ${parseError.message}`
    );
  }

  // NewsAPI returns HTTP 200 with { status: "ok", ... } on success, and a
  // non-2xx status with { status: "error", code, message } on failure
  // (e.g. apiKeyMissing, apiKeyInvalid, rateLimited) — check both explicitly
  // rather than trusting response.ok alone.
  if (!response.ok || data.status === "error") {
    const codeSuffix = data?.code ? ` [${data.code}]` : "";
    throw new Error(
      `NewsAPI error${codeSuffix} (HTTP ${response.status}): ${data?.message || response.statusText}`
    );
  }

  if (!Array.isArray(data.articles)) {
    throw new Error("NewsAPI response is missing an 'articles' array");
  }

  return data.articles.map((article) => ({
    title: article.title ?? "",
    description: article.description ?? "",
    // Full-ish body when NewsAPI provides it (often truncated with "[+N chars]").
    // fetcher.normalizeNewsApiArticle() prefers this over description for AI context.
    content: article.content ?? "",
    url: article.url ?? "",
    urlToImage: article.urlToImage ?? ""
  }));
}
