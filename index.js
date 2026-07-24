import Parser from "rss-parser";
import { createClient } from "@supabase/supabase-js";
import { fetchNewsFromNewsApi } from "./newsapi.js";
import { publishAll } from "./publishers/index.js";

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

// Prompt version history (Phase 3 — AI_PIPELINE.md "Prompt Versioning"):
//   v1 (Phase 0-2): free-text response with "LABEL: value" lines, parsed via
//     regex. Fragile — any formatting drift silently produced empty fields.
//   v2 (Phase 3, current): structured JSON output via Gemini's
//     responseSchema (see RESPONSE_SCHEMA below) — the model is constrained
//     to return valid, schema-conforming JSON, removing regex parsing
//     entirely. Adds seoTitle (new field, needed for Phase 6 website).
const PROMPT_VERSION = 2;

// Describes the exact JSON shape Gemini must return (Gemini's "controlled
// generation" / responseSchema feature). This replaces the old free-text
// "CATEGORY: ...\nURDU_TITLE: ..." format + regex parsing — the API itself
// now enforces the structure, so we only need to validate *content*
// (non-empty required fields), not *shape*.
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    category: {
      type: "STRING",
      description: "A short news category, e.g. Technology, World, Sports, Business, Politics"
    },
    urduTitle: { type: "STRING", description: "The headline translated into Urdu" },
    urduSummary: { type: "STRING", description: "A two-sentence Urdu summary of the story" },
    seoTitle: {
      type: "STRING",
      description:
        "A concise, SEO-friendly Urdu title (distinct from urduTitle) suitable for a webpage <title> tag and search results"
    },
    article: { type: "STRING", description: "A detailed, roughly 300-word Urdu article" },
    hashtags: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "3-5 relevant hashtags, each starting with #, e.g. #News, #Technology"
    },
    facebookPost: {
      type: "STRING",
      description: "A complete, ready-to-publish Facebook post in Urdu"
    },
    imagePrompt: {
      type: "STRING",
      description: "A professional, descriptive prompt suitable for an AI image generator"
    }
  },
  required: [
    "category",
    "urduTitle",
    "urduSummary",
    "seoTitle",
    "article",
    "hashtags",
    "facebookPost",
    "imagePrompt"
  ]
};

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
 * Parses Gemini's JSON response text into our internal result shape.
 * Even with a responseSchema, this is wrapped defensively — truncated
 * output (e.g. hitting a token limit) or an empty string can still
 * produce invalid JSON, and we never want that to throw an unhandled
 * exception deep in the retry loop.
 */
function parseAiResponse(aiText) {
  let parsed;
  try {
    parsed = JSON.parse(aiText);
  } catch (error) {
    throw new Error(`AI response was not valid JSON: ${error.message}`);
  }

  const hashtags = Array.isArray(parsed.hashtags)
    ? parsed.hashtags.filter((tag) => typeof tag === "string" && tag.trim())
    : [];

  return {
    category: typeof parsed.category === "string" ? parsed.category.trim() : "",
    urduTitle: typeof parsed.urduTitle === "string" ? parsed.urduTitle.trim() : "",
    urduSummary: typeof parsed.urduSummary === "string" ? parsed.urduSummary.trim() : "",
    seoTitle: typeof parsed.seoTitle === "string" ? parsed.seoTitle.trim() : "",
    article: typeof parsed.article === "string" ? parsed.article.trim() : "",
    // Stored as a single space-separated string (see DATABASE_SCHEMA.md —
    // the `hashtags` column is `text`, not an array type), even though we
    // work with a clean array internally while it's easy to do so.
    hashtags: hashtags.join(" "),
    facebookPost: typeof parsed.facebookPost === "string" ? parsed.facebookPost.trim() : "",
    imagePrompt: typeof parsed.imagePrompt === "string" ? parsed.imagePrompt.trim() : ""
  };
}

/**
 * A parsed response is considered valid only if the fields we actually
 * publish downstream (Urdu title/summary + article) were extracted.
 * Missing category/hashtags/etc. are non-fatal and fall back to defaults.
 */
function isValidAiResult(result) {
  return Boolean(result.urduTitle && result.urduSummary && result.article);
}

async function callGemini(title) {
  const prompt = `You are a professional Urdu news editor. Analyze the following English news headline and produce Urdu content for a news platform, following the response schema exactly.

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
      ],
      generationConfig: {
        // Constrains Gemini to return JSON matching RESPONSE_SCHEMA exactly
        // (Phase 3) instead of the old free-text "LABEL: value" format that
        // required fragile regex parsing.
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA
        // Note: Gemini 3.x models deprecate temperature/top_p/top_k tuning —
        // Google recommends keeping generation defaults for these models,
        // so no sampling overrides are sent here (unlike the previous
        // Groq call, which used temperature: 0.7).
      }
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

function buildImageUrl(imagePrompt) {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}`;
}

function buildNewsRow(item, sourceName, aiResult) {
  return {
    title: item.title,
    source: sourceName,
    url: item.link,
    category: aiResult.category,
    urdu_title: aiResult.urduTitle,
    urdu_summary: aiResult.urduSummary,
    seo_title: aiResult.seoTitle,
    article: aiResult.article,
    hashtags: aiResult.hashtags,
    facebook_post: aiResult.facebookPost,
    image_prompt: aiResult.imagePrompt,
    image_url: buildImageUrl(aiResult.imagePrompt)
  };
}

// Postgres error code for "a referenced column does not exist" —
// see https://www.postgresql.org/docs/current/errcodes-appendix.html
const POSTGRES_UNDEFINED_COLUMN = "42703";

/**
 * Runs a Supabase write (insert/update) and, if Postgres reports a
 * specific column as undefined (42703), strips that field from the row
 * and retries — repeating until the write succeeds or there's nothing
 * left to strip. This lets genuinely new/optional columns (seo_title,
 * fb_post_id, telegram_message_id, whatsapp_status, x_post_id,
 * published_at — see DATABASE_SCHEMA.md) degrade gracefully instead of
 * breaking every write until their migration is actually applied to the
 * real Supabase table, which this bot has no credentials to do itself.
 */
async function writeWithColumnFallback(row, performWrite, { maxAttempts = 8 } = {}) {
  let currentRow = { ...row };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (Object.keys(currentRow).length === 0) {
      throw new Error("Write failed: all optional columns were missing from the table");
    }

    const { data, error } = await performWrite(currentRow);

    if (!error) {
      return data;
    }

    const missingColumn =
      error.code === POSTGRES_UNDEFINED_COLUMN
        ? error.message?.match(/column "(\w+)"/i)?.[1]
        : undefined;

    if (!missingColumn || !(missingColumn in currentRow)) {
      throw new Error(`Write failed: ${error.message}`);
    }

    log(
      "warn",
      `'${missingColumn}' column not found on the news table — retrying without it. ` +
        "Run the missing migration in DATABASE_SCHEMA.md to store this field going forward."
    );
    const { [missingColumn]: _omit, ...rest } = currentRow;
    currentRow = rest;
  }

  throw new Error("Write failed: too many missing columns (exceeded retry attempts)");
}

/**
 * Inserts a processed article and returns its new row id (used afterward
 * to record publish status — see updatePublishStatus).
 */
async function saveNews(item, sourceName, aiResult) {
  const row = buildNewsRow(item, sourceName, aiResult);
  const data = await writeWithColumnFallback(row, (currentRow) =>
    supabase.from("news").insert(currentRow).select("id").single()
  );
  return data.id;
}

/**
 * Records the outcome of publishAll() against the saved row, using the
 * same graceful column-fallback as saveNews (these tracking columns are
 * proposed additions per DATABASE_SCHEMA.md and may not exist yet).
 * Never throws — a failure here just means publish status isn't tracked
 * this time; it never affects the already-saved article.
 */
async function updatePublishStatus(newsId, publishResults) {
  const updateRow = {};
  if (publishResults.facebook?.published) updateRow.fb_post_id = publishResults.facebook.id;
  if (publishResults.telegram?.published) updateRow.telegram_message_id = publishResults.telegram.id;
  if (publishResults.whatsapp?.published) updateRow.whatsapp_status = "sent";
  if (publishResults.x?.published) updateRow.x_post_id = publishResults.x.id;

  if (Object.keys(updateRow).length === 0) {
    return;
  }
  updateRow.published_at = new Date().toISOString();

  try {
    await writeWithColumnFallback(updateRow, (currentRow) =>
      supabase.from("news").update(currentRow).eq("id", newsId).select("id").single()
    );
  } catch (error) {
    log("warn", "Failed to record publish status (article itself was saved fine)", {
      newsId,
      message: error.message
    });
  }
}

/**
 * Publishes the just-saved article to every configured social channel
 * (Phase 4) and records the outcome. Wrapped so that any failure here —
 * a channel erroring, or the status update failing — is logged but never
 * propagates: the article is already saved successfully by this point,
 * and a publishing hiccup shouldn't be treated the same as a processing
 * failure (it doesn't count against `failed` in the run summary).
 */
async function publishAndRecord(newsId, item, sourceName, aiResult) {
  try {
    const results = await publishAll({
      urduTitle: aiResult.urduTitle,
      urduSummary: aiResult.urduSummary,
      facebookPost: aiResult.facebookPost,
      hashtags: aiResult.hashtags,
      imageUrl: buildImageUrl(aiResult.imagePrompt),
      sourceUrl: item.link
    });

    const summary = Object.entries(results)
      .filter(([, result]) => !result.skipped)
      .map(([channel, result]) => `${channel}=${result.published ? "ok" : `failed(${result.error})`}`);

    if (summary.length > 0) {
      log("info", "Publish results", { source: sourceName, summary: summary.join(", ") });
      await updatePublishStatus(newsId, results);
    }
  } catch (error) {
    log("warn", "Publishing step failed (article was still saved)", {
      newsId,
      message: error.message
    });
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
  const newsId = await saveNews(item, sourceName, aiResult);
  log("info", "News saved with full AI analysis", { title: item.title, source: sourceName });

  await publishAndRecord(newsId, item, sourceName, aiResult);

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
  log("info", `Starting run (AI prompt v${PROMPT_VERSION})`);

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
