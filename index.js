import Parser from "rss-parser";
import { createClient } from "@supabase/supabase-js";
import { fetchNewsFromNewsApi } from "./newsapi.js";

const parser = new Parser();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Config-driven list of RSS sources (Phase 2). Each is fetched independently;
// a failure fetching one source does not stop the others (fail-soft).
//
// Reuters was considered (per PROJECT_ROADMAP.md Phase 2) but is intentionally
// omitted: their public RSS feeds were discontinued around 2020 and the
// documented feed URLs no longer return valid RSS (verified before adding
// this list — see PROJECT_ROADMAP.md Phase 2 notes).
const SOURCES = [
  { name: "BBC", url: "https://feeds.bbci.co.uk/news/rss.xml" },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { name: "Dawn", url: "https://www.dawn.com/feeds/home" },
  { name: "Geo News", url: "https://www.geo.tv/rss/1/1" },
  { name: "ARY News", url: "https://arynews.tv/feed/" }
];

// Optional additional source: NewsAPI.org (see newsapi.js). Only used if
// NEWS_API_KEY is set — if it's missing, this source is skipped entirely
// (info log, not an error) so the bot keeps working for anyone who hasn't
// configured a NewsAPI key yet.
const NEWS_API_QUERIES = ["technology"];

// How many fresh (non-duplicate) items to consider per source...
const MAX_ITEMS_PER_SOURCE = 3;
// ...and an overall safety cap across all sources combined per run, so
// adding more sources later can't silently explode AI/API usage in one run.
const MAX_ITEMS_PER_RUN = 10;

// Minimum delay between AI calls, so processing several items across
// several sources doesn't burst past Gemini's per-minute rate limits.
const AI_CALL_SPACING_MS = 1500;

// Retry settings for the Gemini API call.
const AI_MAX_RETRIES = 2;
const AI_RETRY_DELAY_MS = 2000;

// Gemini 3.5 Flash-Lite: Google's recommended model (as of mid-2026) for
// high-volume, low-latency extraction/classification/translation tasks —
// a good fit for an hourly bot translating/categorizing several headlines
// per run. See AI_PIPELINE.md ("Why Gemini") for the full reasoning.
const GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function log(level, message, meta) {
  const line = `[${level.toUpperCase()}] ${message}`;
  if (meta !== undefined) {
    console.log(line, meta);
  } else {
    console.log(line);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extracts a labeled field from the AI's free-text response.
 * Captures everything up to the next known label (or end of string),
 * so multi-line fields like ARTICLE/FACEBOOK_POST aren't truncated to one line.
 */
function extractField(text, label, allLabels) {
  const otherLabels = allLabels.filter((l) => l !== label);
  const lookahead = otherLabels.length
    ? `(?:${otherLabels.join("|")}):|$`
    : "$";
  const pattern = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=${lookahead})`, "i");
  return text.match(pattern)?.[1]?.trim() || "";
}

const AI_LABELS = [
  "CATEGORY",
  "URDU_TITLE",
  "URDU_SUMMARY",
  "ARTICLE",
  "HASHTAGS",
  "FACEBOOK_POST",
  "IMAGE_PROMPT"
];

function parseAiResponse(aiText) {
  return {
    category: extractField(aiText, "CATEGORY", AI_LABELS) || "General",
    urduTitle: extractField(aiText, "URDU_TITLE", AI_LABELS),
    urduSummary: extractField(aiText, "URDU_SUMMARY", AI_LABELS),
    article: extractField(aiText, "ARTICLE", AI_LABELS),
    hashtags: extractField(aiText, "HASHTAGS", AI_LABELS),
    facebookPost: extractField(aiText, "FACEBOOK_POST", AI_LABELS),
    imagePrompt: extractField(aiText, "IMAGE_PROMPT", AI_LABELS)
  };
}

/**
 * A parsed response is considered valid only if the fields we actually
 * publish downstream (Urdu title/summary + article) were extracted.
 * Missing category/hashtags/etc. are non-fatal and fall back to defaults.
 */
function isValidAiResult(result) {
  return Boolean(
    result.urduTitle && result.urduSummary && result.article
  );
}

async function callGemini(title) {
  const prompt = `Analyze this news headline and return EXACTLY in this format:

CATEGORY: Technology
URDU_TITLE: Urdu headline
URDU_SUMMARY: Two sentence Urdu summary
ARTICLE: 300 word detailed Urdu article
HASHTAGS: #News #Technology
FACEBOOK_POST: Complete Facebook post in Urdu
IMAGE_PROMPT: Professional AI image prompt

Headline:
${title}`;

  const response = await fetch(GEMINI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ]
      // Note: Gemini 3.x models deprecate temperature/top_p/top_k tuning —
      // Google recommends keeping generation defaults for these models,
      // so no generationConfig override is sent here (unlike the previous
      // Groq call, which used temperature: 0.7).
    })
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `Gemini API returned ${response.status}: ${response.statusText} ${errorBody}`.trim()
    );
  }

  const data = await response.json();

  const blockReason = data?.promptFeedback?.blockReason;
  if (blockReason) {
    throw new Error(`Gemini blocked the request: ${blockReason}`);
  }

  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!content) {
    throw new Error("Gemini API response missing content");
  }

  return content;
}

/**
 * Calls Gemini with retries, then parses + validates the response.
 * Throws if no valid, well-formed result could be obtained.
 */
async function analyzeNews(title) {
  let lastError;

  for (let attempt = 1; attempt <= AI_MAX_RETRIES + 1; attempt++) {
    try {
      const aiText = await callGemini(title);
      const result = parseAiResponse(aiText);

      if (isValidAiResult(result)) {
        return result;
      }

      lastError = new Error("AI response did not match expected format");
      log("warn", `AI response validation failed (attempt ${attempt})`, { title });
    } catch (error) {
      lastError = error;
      log("warn", `Gemini call failed (attempt ${attempt})`, { message: error.message });
    }

    if (attempt <= AI_MAX_RETRIES) {
      await sleep(AI_RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError;
}

async function isDuplicate(url) {
  const { data, error } = await supabase
    .from("news")
    .select("url")
    .eq("url", url);

  if (error) {
    // Fail closed: if we can't verify, skip processing rather than risk a duplicate insert.
    throw new Error(`Duplicate check failed: ${error.message}`);
  }

  return Boolean(data && data.length > 0);
}

async function saveNews(item, sourceName, aiResult) {
  const { error } = await supabase.from("news").insert({
    title: item.title,
    source: sourceName,
    url: item.link,
    category: aiResult.category,
    urdu_title: aiResult.urduTitle,
    urdu_summary: aiResult.urduSummary,
    article: aiResult.article,
    hashtags: aiResult.hashtags,
    facebook_post: aiResult.facebookPost,
    image_prompt: aiResult.imagePrompt,
    image_url: `https://image.pollinations.ai/prompt/${encodeURIComponent(
      aiResult.imagePrompt
    )}`
  });

  if (error) {
    throw new Error(`Insert failed: ${error.message}`);
  }
}

/**
 * Processes a single item and returns its outcome ("processed" | "skipped"),
 * or throws if it failed. The caller is responsible for fail-soft handling.
 */
async function processItem(item, sourceName) {
  if (!item.link || !item.title) {
    log("warn", "Skipping item with missing title/link", { source: sourceName });
    return "skipped";
  }

  const duplicate = await isDuplicate(item.link);
  if (duplicate) {
    log("info", "Skipping duplicate", { url: item.link, source: sourceName });
    return "skipped";
  }

  const aiResult = await analyzeNews(item.title);
  await saveNews(item, sourceName, aiResult);
  log("info", "News saved with full AI analysis", { title: item.title, source: sourceName });
  return "processed";
}

/**
 * Fetches every configured RSS source independently and collects their items.
 * A source that fails to fetch/parse is logged and skipped — it never
 * stops the other sources from being collected (fail-soft, Phase 1 principle
 * extended to the source level).
 */
async function collectRssItems() {
  const collected = [];

  for (const source of SOURCES) {
    try {
      const feed = await parser.parseURL(source.url);
      const items = feed.items.slice(0, MAX_ITEMS_PER_SOURCE);
      log("info", `Fetched ${feed.items.length} items from ${source.name}, taking ${items.length}`);
      for (const item of items) {
        collected.push({ item, sourceName: source.name });
      }
    } catch (error) {
      log("error", `Failed to fetch feed for ${source.name}`, {
        url: source.url,
        message: error.message
      });
      // Fail-soft: continue with the next source instead of aborting the run.
    }
  }

  return collected;
}

/**
 * Fetches items from NewsAPI.org (see newsapi.js), one query at a time.
 * Skipped entirely (with an info log, not an error) if NEWS_API_KEY isn't
 * set. Each query is fetched independently and fail-soft, same as RSS sources.
 */
async function collectNewsApiItems() {
  if (!process.env.NEWS_API_KEY) {
    log("info", "NEWS_API_KEY not set — skipping NewsAPI source");
    return [];
  }

  const collected = [];

  for (const query of NEWS_API_QUERIES) {
    try {
      const articles = await fetchNewsFromNewsApi(query, { pageSize: MAX_ITEMS_PER_SOURCE });
      log("info", `Fetched ${articles.length} articles from NewsAPI for query "${query}"`);
      for (const article of articles) {
        if (!article.url || !article.title) {
          continue;
        }
        // Adapt NewsAPI's shape to the { title, link } shape the rest of
        // the pipeline (isDuplicate/analyzeNews/saveNews) already expects
        // from RSS items.
        collected.push({
          item: { title: article.title, link: article.url },
          sourceName: "NewsAPI"
        });
      }
    } catch (error) {
      log("error", `Failed to fetch NewsAPI results for query "${query}"`, {
        message: error.message
      });
      // Fail-soft: continue with the next query instead of aborting the run.
    }
  }

  return collected;
}

async function collectItems() {
  const rssItems = await collectRssItems();
  const newsApiItems = await collectNewsApiItems();
  return [...rssItems, ...newsApiItems].slice(0, MAX_ITEMS_PER_RUN);
}

async function run() {
  const candidates = await collectItems();

  const activeSourceCount = SOURCES.length + (process.env.NEWS_API_KEY ? 1 : 0);
  log(
    "info",
    `Collected ${candidates.length} candidate items from ${activeSourceCount} source(s)`
  );

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const { item, sourceName } of candidates) {
    try {
      const outcome = await processItem(item, sourceName);
      if (outcome === "processed") {
        processed++;
        // Throttle: only wait after an actual AI call, not after skips.
        await sleep(AI_CALL_SPACING_MS);
      } else {
        skipped++;
      }
    } catch (error) {
      failed++;
      log("error", "Failed to process item", {
        title: item.title,
        url: item.link,
        source: sourceName,
        message: error.message
      });
      // Fail-soft: continue with the next item instead of aborting the whole run.
    }
  }

  log("info", "Run complete", {
    processed,
    skipped,
    failed,
    total: candidates.length,
    sources: activeSourceCount
  });
}

run().catch((error) => {
  log("error", "Fatal error in run()", { message: error.message });
  process.exitCode = 1;
});
