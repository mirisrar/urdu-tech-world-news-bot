import { createClient } from "@supabase/supabase-js";
import { fetchNewsFromNewsApi } from "./newsapi.js";
import { publishAll } from "./publishers/index.js";
import { storeOriginalArticleImage } from "./imagePipeline.js";
import { sendRunAlert } from "./monitoring/runAlert.js";
import {
  fetchRssFeed,
  normalizeNewsApiArticle,
  hasUsableSourceText,
  resolveArticleImage
} from "./fetcher.js";
import { analyzeNews, PROMPT_VERSION } from "./ai_agent.js";
import { matchesAnyTitle, normalizeTitle } from "./dedupe.js";
import { retryPendingPublishes } from "./publishRetry.js";
import {
  loadPublishState,
  persistPublishState,
  wasFacebookPosted,
  markFacebookPosted,
  getFacebookPostedId
} from "./publishState.js";
import {
  getFacebookThrottleConfig,
  getFacebookBlockReason
} from "./publishers/facebookThrottle.js";
import { fetchTopicStockImage, hasStockImageProvider } from "./stockImage.js";
import {
  enqueueFacebookNews,
  enqueueMissingNewsForFacebook,
  isFacebookQueueEnabled,
  processFacebookQueue,
  facebookScheduleGapMs
} from "./facebookQueue.js";

// Phase 6: the website (Nexora News Urdu) now reads the `news` table
// directly from the browser using the Supabase JS SDK + SUPABASE_ANON_KEY.
// That means the anon key is effectively public, and Row Level Security
// must restrict the "anon" role to SELECT-only (see DATABASE_SCHEMA.md for
// the required RLS policy). Once that's in place, the bot can no longer
// write with the anon key — it needs SUPABASE_SERVICE_ROLE_KEY, which
// bypasses RLS entirely and must stay server-side only (GitHub Actions
// secrets), never exposed to the website/browser.
//
// SUPABASE_ANON_KEY is kept as a fallback for anyone who hasn't migrated
// yet, but this will stop working the moment the recommended read-only RLS
// policy is applied — see SECURITY_GUIDELINES.md and DATABASE_SCHEMA.md.
const supabaseWriteKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log(
    "[WARN] SUPABASE_SERVICE_ROLE_KEY is not set - falling back to SUPABASE_ANON_KEY for bot writes. " +
      "Under website RLS (anon SELECT-only), the bot CANNOT save fb_post_id — that causes DUPLICATE Facebook posts. " +
      "Add SUPABASE_SERVICE_ROLE_KEY from Supabase → Settings → API as a GitHub Actions secret NOW."
  );
}

const supabase = createClient(process.env.SUPABASE_URL, supabaseWriteKey);

// Config-driven list of RSS sources (Phase 2). Each is fetched independently;
// a failure fetching one source does not stop the others (fail-soft).
//
// Pakistan / local coverage: Google News RSS is listed FIRST so local stories
// fill the per-run cap before international feeds. Direct Dawn/Geo/ARY feeds
// still work in many environments, but GitHub Actions runners sometimes see
// blocks/timeouts — Google News aggregates those same publishers reliably.
//
// Verified 2026-07-26:
//   ✅ https://news.google.com/rss?hl=en-PK&gl=PK&ceid=PK:en  (~38 items)
//   ✅ https://news.google.com/rss?hl=ur&gl=PK&ceid=PK:ur     (~38 items)
//   ❌ https://news.google.com/rss/headlines/section/geo/PK   ("feed not available")
//
// Reuters public RSS remains omitted (feeds discontinued ~2020).
const SOURCES = [
  {
    name: "Google News PK",
    url: "https://news.google.com/rss?hl=en-PK&gl=PK&ceid=PK:en",
    googleNews: true
  },
  {
    name: "Google News Urdu",
    url: "https://news.google.com/rss?hl=ur&gl=PK&ceid=PK:ur",
    googleNews: true
  },
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

// Tunable via env (see .env.example / news.yml). Defaults are sized for a
// ~5-minute schedule: pull plenty from each feed, then process every *new*
// (non-duplicate) item up to a safety cap so Gemini/API cost can't explode.
// Facebook is capped separately (1 post/run by default).
function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// How many items to pull from each RSS/NewsAPI source per run...
const MAX_ITEMS_PER_SOURCE = envInt("MAX_ITEMS_PER_SOURCE", 25);
// ...and max *new* (non-duplicate) items to AI-process + publish per run.
const MAX_ITEMS_PER_RUN = envInt("MAX_ITEMS_PER_RUN", 40);

// Minimum delay between AI calls (rate-limit cushion).
const AI_CALL_SPACING_MS = envInt("AI_CALL_SPACING_MS", 1000);

// Phase 9 — title-similarity dedupe window + publish retry batch size.
const TITLE_DEDUPE_LOOKBACK = envInt("TITLE_DEDUPE_LOOKBACK", 200);
const PUBLISH_RETRY_LIMIT = envInt("PUBLISH_RETRY_LIMIT", 10);
const PUBLISH_RETRY_LOOKBACK_HOURS = envInt("PUBLISH_RETRY_LOOKBACK_HOURS", 48);
const TITLE_SIMILARITY_THRESHOLD = Number.parseFloat(
  process.env.TITLE_SIMILARITY_THRESHOLD || "0.72"
);

// When no original article cover exists: try Unsplash/Pexels by topic.
// If that also fails (or no API key), skip the item — never use a fixed default image.
const SKIP_IF_NO_TOPIC_IMAGE = !["0", "false", "no", "off"].includes(
  String(process.env.SKIP_IF_NO_TOPIC_IMAGE || "true").toLowerCase()
);

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

/**
 * Recent headlines from DB for near-duplicate title checks (Phase 9).
 * Fail-soft: returns [] if the query fails.
 */
async function loadRecentTitles() {
  const { data, error } = await supabase
    .from("news")
    .select("title, urdu_title")
    .order("id", { ascending: false })
    .limit(TITLE_DEDUPE_LOOKBACK);

  if (error) {
    log("warn", "Could not load recent titles for similarity dedupe", {
      message: error.message
    });
    return [];
  }

  const titles = [];
  for (const row of data || []) {
    if (row.title) titles.push(row.title);
    if (row.urdu_title) titles.push(row.urdu_title);
  }
  return titles;
}

/**
 * Build image_credit for AdSense-safe attribution.
 * @param {string} sourceName
 * @param {"rss"|"meta"|"unsplash"|"pexels"|string} imageSource
 * @param {string} [imageCredit]
 */
function resolveImageCredit(sourceName, imageSource, imageCredit = "") {
  const explicit = String(imageCredit || "").trim();
  if (explicit) return explicit;
  if (imageSource === "unsplash") return "Source: Unsplash";
  if (imageSource === "pexels") return "Source: Pexels";
  if (sourceName) return `Source: ${sourceName}`;
  return "";
}

function buildNewsRow(item, sourceName, aiResult, imageUrl, imageCredit = "") {
  return {
    title: item.title,
    source: sourceName,
    url: item.link,
    category: aiResult.category,
    urdu_title: aiResult.urduTitle,
    urdu_summary: aiResult.urduSummary,
    seo_title: aiResult.seoTitle,
    seo_description: aiResult.seoDescription || aiResult.urduSummary || "",
    seo_keywords: aiResult.seoKeywords || "",
    article: aiResult.article,
    hashtags: aiResult.hashtags,
    facebook_post: aiResult.facebookPost,
    // AI image prompts disabled — column left empty / omitted via fallback if unused.
    image_prompt: "",
    image_url: imageUrl,
    image_credit: imageCredit || ""
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
async function saveNews(item, sourceName, aiResult, imageUrl, imageCredit = "") {
  const row = buildNewsRow(item, sourceName, aiResult, imageUrl, imageCredit);
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
    return { saved: false, reason: "nothing_to_save" };
  }
  updateRow.published_at = new Date().toISOString();

  try {
    await writeWithColumnFallback(updateRow, async (currentRow) => {
      // Avoid .single() — 0-row updates (common under anon+RLS) throw
      // "Cannot coerce the result to a single JSON object" and hide the real issue.
      const result = await supabase.from("news").update(currentRow).eq("id", newsId).select("id");

      if (result.error) {
        return result;
      }

      if (result.data && result.data.length > 0) {
        return { data: result.data[0], error: null };
      }

      // UPDATE matched 0 rows (almost always RLS blocking anon updates).
      return {
        data: null,
        error: {
          message:
            `Publish status update matched 0 rows for id=${newsId}. ` +
            "Add SUPABASE_SERVICE_ROLE_KEY (bypasses RLS) or the bot cannot save fb_post_id " +
            "and will re-post the same stories to Facebook."
        }
      };
    });
    return { saved: true };
  } catch (error) {
    log("warn", "Failed to record publish status (article itself was saved fine)", {
      newsId,
      message: error.message
    });
    return { saved: false, reason: error.message };
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
async function publishAndRecord(newsId, item, sourceName, aiResult, imageUrl) {
  try {
    const skipFacebook = wasFacebookPosted(newsId);
    const useQueue = isFacebookQueueEnabled();

    // Facebook: enqueue for 5-min stagger (B4). Other channels still publish now.
    const onlyChannels = skipFacebook || useQueue
      ? ["telegram", "whatsapp", "x"]
      : undefined;

    const results = await publishAll(
      {
        urduTitle: aiResult.urduTitle,
        urduSummary: aiResult.urduSummary,
        facebookPost: aiResult.facebookPost,
        hashtags: aiResult.hashtags,
        imageUrl,
        sourceUrl: item.link,
        newsId
      },
      onlyChannels ? { onlyChannels } : undefined
    );

    if (skipFacebook) {
      results.facebook = {
        published: false,
        skipped: true,
        reason: "already_posted_state"
      };
      const priorId = getFacebookPostedId(newsId);
      if (priorId) {
        await updatePublishStatus(newsId, { facebook: { published: true, id: priorId } });
      }
    } else if (useQueue) {
      const queued = await enqueueFacebookNews(
        supabase,
        {
          newsId,
          facebookPost: aiResult.facebookPost,
          hashtags: aiResult.hashtags,
          imageUrl
        },
        log
      );
      results.facebook = queued.queued
        ? {
            published: false,
            skipped: true,
            reason: `queued_until_${queued.scheduledAt}`
          }
        : {
            published: false,
            skipped: true,
            reason: queued.reason || "queue_skip"
          };
    }

    if (results.facebook?.published && results.facebook.id) {
      markFacebookPosted(newsId, results.facebook.id);
    }

    const summary = Object.entries(results)
      .filter(([, result]) => !result.skipped || result.reason)
      .map(([channel, result]) => {
        if (result.published) return `${channel}=ok`;
        if (result.skipped && result.reason) return `${channel}=deferred(${result.reason})`;
        return `${channel}=failed(${result.error})`;
      });

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

  if (!hasUsableSourceText(item)) {
    log("warn", "Skipping item with no usable source text", { source: sourceName, title: item.title });
    return "skipped";
  }

  const duplicate = await isDuplicate(item.link);
  if (duplicate) {
    log("info", "Skipping duplicate", { url: item.link, source: sourceName });
    return "skipped";
  }

  // 1) Real article cover (RSS / og:image / publisher page).
  // 2) Else dynamic Unsplash/Pexels image for the topic/category.
  // 3) Else skip — never a fixed default / random stock URL.
  let { imageUrl, source: imageSource } = await resolveArticleImage(item, log, {
    sourceName,
    allowPlaceholder: false
  });

  if (imageSource === "none") {
    if (!hasStockImageProvider()) {
      log("info", "Skipping item — no article photo and no Unsplash/Pexels API key", {
        source: sourceName,
        title: item.title,
        url: item.link
      });
      return "skipped";
    }

    // Light AI category first so the stock search matches the topic.
    const aiPreview = await analyzeNews(
      {
        title: item.title,
        rawContent: item.rawContent || "",
        description: item.description || ""
      },
      log
    );

    const stock = await fetchTopicStockImage(
      {
        title: item.title,
        link: item.link,
        category: aiPreview.category,
        sourceName
      },
      log
    );

    if (!stock?.imageUrl) {
      if (SKIP_IF_NO_TOPIC_IMAGE) {
        log("info", "Skipping item — no article photo and topic stock image fetch failed", {
          source: sourceName,
          title: item.title,
          category: aiPreview.category
        });
        return "skipped";
      }
      log("warn", "No topic stock image — skipping because placeholders are disabled", {
        title: item.title
      });
      return "skipped";
    }

    // Continue with AI result we already have (avoid a second Gemini call).
    const imageStored = await storeOriginalArticleImage(
      supabase,
      stock.imageUrl,
      item.title,
      log
    );
    const imageCredit = resolveImageCredit(
      sourceName,
      stock.provider,
      stock.imageCredit
    );

    log("info", "Resolved article image", {
      source: sourceName,
      title: item.title,
      imageSource: stock.provider,
      category: aiPreview.category,
      imageCredit,
      imageUrl: (imageStored || "").slice(0, 120)
    });

    const newsId = await saveNews(
      item,
      sourceName,
      aiPreview,
      imageStored,
      imageCredit
    );
    log("info", "News saved with full AI analysis", { title: item.title, source: sourceName });
    await publishAndRecord(newsId, item, sourceName, aiPreview, imageStored);
    return "processed";
  }

  const aiResult = await analyzeNews(
    {
      title: item.title,
      rawContent: item.rawContent || "",
      description: item.description || ""
    },
    log
  );

  log("info", "AI Urdu package ready", {
    source: sourceName,
    title: item.title,
    bodyLength: aiResult.article?.length || 0
  });

  imageUrl = await storeOriginalArticleImage(supabase, imageUrl, item.title, log);
  const imageCredit = resolveImageCredit(sourceName, imageSource);

  log("info", "Resolved article image", {
    source: sourceName,
    title: item.title,
    imageSource,
    category: aiResult.category,
    imageCredit,
    imageUrl: (imageUrl || "").slice(0, 120)
  });

  const newsId = await saveNews(item, sourceName, aiResult, imageUrl, imageCredit);
  log("info", "News saved with full AI analysis", { title: item.title, source: sourceName });

  await publishAndRecord(newsId, item, sourceName, aiResult, imageUrl);

  return "processed";
}

/**
 * Fetches every configured RSS source in parallel (Phase 9) and collects
 * items with full/raw content extracted (fetcher.js) for the AI agent.
 * One failing source never blocks the others (Promise.allSettled).
 */
async function collectRssItems() {
  const settled = await Promise.allSettled(
    SOURCES.map(async (source) => {
      const { items } = await fetchRssFeed(source.url, MAX_ITEMS_PER_SOURCE, {
        googleNews: Boolean(source.googleNews)
      });
      return { source, items };
    })
  );

  const collected = [];

  for (const result of settled) {
    if (result.status === "rejected") {
      log("error", "Failed to fetch an RSS source", {
        message: result.reason?.message || String(result.reason)
      });
      continue;
    }

    const { source, items } = result.value;
    log("info", `Fetched ${items.length} items from ${source.name}`, {
      withContent: items.filter((i) => (i.rawContent || "").length >= 80).length
    });

    for (const item of items) {
      // Prefer the publisher Google News embeds in the title (Dawn, Geo, …)
      // so the DB `source` column reflects the real outlet, not just the aggregator.
      const sourceName = item.publisher
        ? `${source.name} / ${item.publisher}`
        : source.name;
      collected.push({ item, sourceName });
    }
  }

  return collected;
}

/**
 * Fetches items from NewsAPI.org (see newsapi.js), one query at a time.
 * Includes description/content via normalizeNewsApiArticle() for AI context.
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
        const item = normalizeNewsApiArticle(article);
        if (!item.link || !item.title) continue;
        collected.push({ item, sourceName: "NewsAPI" });
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

/**
 * Collect from all sources, then keep only *new* items up to MAX_ITEMS_PER_RUN:
 *  1) URL not already in DB
 *  2) Title not near-duplicate of a recent DB/in-batch headline (Phase 9)
 */
async function collectItems() {
  const rssItems = await collectRssItems();
  const newsApiItems = await collectNewsApiItems();
  const candidates = [...rssItems, ...newsApiItems];

  const recentTitles = await loadRecentTitles();
  const batchTitles = [];

  const fresh = [];
  let alreadyKnown = 0;
  let similarTitle = 0;

  for (const entry of candidates) {
    if (!entry.item?.link || !entry.item?.title) continue;
    try {
      const dup = await isDuplicate(entry.item.link);
      if (dup) {
        alreadyKnown++;
        continue;
      }
    } catch (error) {
      log("warn", "Duplicate check failed — keeping item as candidate", {
        url: entry.item.link,
        message: error.message
      });
    }

    const threshold = Number.isFinite(TITLE_SIMILARITY_THRESHOLD)
      ? TITLE_SIMILARITY_THRESHOLD
      : 0.72;

    if (
      matchesAnyTitle(entry.item.title, recentTitles, threshold) ||
      matchesAnyTitle(entry.item.title, batchTitles, threshold)
    ) {
      similarTitle++;
      log("info", "Skipping near-duplicate title", {
        title: entry.item.title,
        normalized: normalizeTitle(entry.item.title).slice(0, 80)
      });
      continue;
    }

    batchTitles.push(entry.item.title);
    fresh.push(entry);
    if (fresh.length >= MAX_ITEMS_PER_RUN) break;
  }

  log("info", "Fresh items after dedupe", {
    fetched: candidates.length,
    alreadyKnown,
    similarTitle,
    fresh: fresh.length,
    cap: MAX_ITEMS_PER_RUN
  });

  return fresh;
}

async function run() {
  const startedAt = Date.now();
  loadPublishState(log);
  const fbCfg = getFacebookThrottleConfig();
  log("info", `Starting run (AI prompt v${PROMPT_VERSION})`, {
    maxItemsPerSource: MAX_ITEMS_PER_SOURCE,
    maxItemsPerRun: MAX_ITEMS_PER_RUN,
    aiCallSpacingMs: AI_CALL_SPACING_MS,
    facebookMaxPostsPerRun: fbCfg.maxPerRun,
    facebookMaxPostsPerDay: fbCfg.maxPerDay,
    facebookMinGapMs: fbCfg.minGapMs,
    facebookScheduleGapMs: facebookScheduleGapMs(),
    facebookUseQueue: isFacebookQueueEnabled(),
    facebookPauseUntil: fbCfg.pauseUntilIso || null,
    facebookBlocked: getFacebookBlockReason(),
    skipIfNoTopicImage: SKIP_IF_NO_TOPIC_IMAGE,
    hasStockImageProvider: hasStockImageProvider(),
    hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    websiteBaseUrl: process.env.WEBSITE_BASE_URL || "https://www.nexoranewsurdu.com"
  });

  // B5: Admin / orphan news → same Facebook queue (5-min stagger).
  if (isFacebookQueueEnabled()) {
    try {
      await enqueueMissingNewsForFacebook(supabase, {}, log);
    } catch (error) {
      log("warn", "Facebook queue backfill failed", { message: error.message });
    }
  }

  // B4: post anything whose scheduled_at is due.
  if (isFacebookQueueEnabled()) {
    try {
      const queueStats = await processFacebookQueue(supabase, updatePublishStatus, log);
      log("info", "Facebook queue process", queueStats);
    } catch (error) {
      log("warn", "Facebook queue process failed", { message: error.message });
    }
  }

  const candidates = await collectItems();

  const activeSourceCount = SOURCES.length + (process.env.NEWS_API_KEY ? 1 : 0);
  log(
    "info",
    `Processing ${candidates.length} new item(s) from ${activeSourceCount} source(s)`
  );

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [];

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
      errors.push(`[${sourceName}] ${item.title || item.link || "?"}: ${error.message}`);
      log("error", "Failed to process item", {
        title: item.title,
        url: item.link,
        source: sourceName,
        message: error.message
      });
      // Fail-soft: continue with the next item instead of aborting the whole run.
    }
  }

  // Phase 9: DB-backed retry for recent rows missing social posts.
  // When FB queue is on, retry skips Facebook (queue owns that channel).
  let publishRetry = { attempted: 0, publishedAny: 0, skipped: 0 };
  try {
    publishRetry = await retryPendingPublishes(supabase, updatePublishStatus, log, {
      limit: PUBLISH_RETRY_LIMIT,
      lookbackHours: PUBLISH_RETRY_LOOKBACK_HOURS,
      skipFacebook: isFacebookQueueEnabled()
    });
  } catch (error) {
    log("warn", "Publish retry step failed", { message: error.message });
  }

  // Drain due Facebook queue again after new items were enqueued this run.
  if (isFacebookQueueEnabled()) {
    try {
      const queueStats = await processFacebookQueue(supabase, updatePublishStatus, log);
      if (queueStats.posted || queueStats.failed) {
        log("info", "Facebook queue process (post-run)", queueStats);
      }
    } catch (error) {
      log("warn", "Facebook queue process (post-run) failed", {
        message: error.message
      });
    }
  }

  const summary = {
    processed,
    skipped,
    failed,
    total: candidates.length,
    sources: activeSourceCount,
    errors,
    status: failed > 0 ? "degraded" : "ok",
    durationMs: Date.now() - startedAt,
    publishRetryAttempted: publishRetry.attempted,
    publishRetryOk: publishRetry.publishedAny
  };

  log("info", "Run complete", {
    processed,
    skipped,
    failed,
    total: candidates.length,
    sources: activeSourceCount,
    durationMs: summary.durationMs,
    publishRetry
  });

  persistPublishState(log);

  // Phase 8: Telegram health alert (fail-soft — never breaks the run).
  await sendRunAlert(summary, log);
}

run().catch(async (error) => {
  log("error", "Fatal error in run()", { message: error.message });
  process.exitCode = 1;
  await sendRunAlert(
    {
      processed: 0,
      skipped: 0,
      failed: 1,
      total: 0,
      sources: SOURCES.length + (process.env.NEWS_API_KEY ? 1 : 0),
      errors: [error.message],
      status: "fatal"
    },
    log
  );
});
