/**
 * AI agent — Urdu news package generation only.
 *
 * Image generation / image_prompt is intentionally DISABLED.
 * Article images come from the original news site via fetcher.js
 * (RSS media tags + og:image / twitter:image).
 */

const GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Prompt version history:
//   v2 — structured JSON, headline-only input
//   v3 — full source text + strict Urdu + AI image_prompt
//   v4 — AI image_prompt removed; images from original article only
export const PROMPT_VERSION = 4;

const AI_MAX_RETRIES = 2;
const AI_RETRY_DELAY_MS = 2000;

/** Minimum Urdu article body length (characters) — ~3–4 paragraphs. */
const MIN_BODY_URDU_CHARS = 450;

/** Arabic / Urdu script detection (enough letters to reject English-only). */
const URDU_SCRIPT_RE = /[\u0600-\u06FF]/g;

const SYSTEM_INSTRUCTION = `You are a senior Urdu news editor for an Urdu news website (Nexora News Urdu).

HARD RULES — violate none of these:
1. Write title_urdu, body_urdu, urdu_summary, seo_title, and facebook_post ONLY in clean Urdu using Arabic script (اردو). Do NOT write those fields in English, Roman Urdu, or Hindi Devanagari.
2. body_urdu MUST be a FULL news article: at least 3 to 4 detailed paragraphs (roughly 300–450 Urdu words). Never return only a headline, one sentence, or a short teaser as body_urdu.
3. Expand from the provided English source title + source text. Stay factual; do not invent quotes or statistics not supported by the source. If source text is thin, write a careful multi-paragraph Urdu news brief from the headline facts only.
4. Do NOT generate image prompts, image URLs, or any visual-generation fields. Images are handled separately from the original news website.
5. Follow the JSON schema exactly.`;

/**
 * Gemini responseSchema — text fields only (no image_prompt).
 */
export const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    category: {
      type: "STRING",
      description: "Short English category label, e.g. Technology, World, Sports, Business, Politics, AI"
    },
    title_urdu: {
      type: "STRING",
      description: "Full news headline in clean Urdu (Arabic script only)"
    },
    urdu_summary: {
      type: "STRING",
      description: "Exactly two sentences of Urdu summary (Arabic script)"
    },
    seo_title: {
      type: "STRING",
      description: "SEO-friendly Urdu title, distinct from title_urdu, Arabic script"
    },
    body_urdu: {
      type: "STRING",
      description:
        "Full Urdu article body in Arabic script: minimum 3–4 detailed paragraphs (~300–450 words). Not a headline."
    },
    hashtags: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "3-5 hashtags starting with # (can mix Urdu/English tags)"
    },
    facebook_post: {
      type: "STRING",
      description: "Ready-to-publish Facebook post entirely in Urdu (Arabic script)"
    }
  },
  required: [
    "category",
    "title_urdu",
    "urdu_summary",
    "seo_title",
    "body_urdu",
    "hashtags",
    "facebook_post"
  ]
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function countUrduChars(text) {
  return (String(text || "").match(URDU_SCRIPT_RE) || []).length;
}

function looksLikeUrdu(text, minChars = 20) {
  return countUrduChars(text) >= minChars;
}

function paragraphCount(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean).length;
}

/**
 * Parse Gemini JSON into the bot's internal result shape (DB-compatible names).
 * imagePrompt is always empty — images come from fetcher.resolveArticleImage().
 */
export function parseAiResponse(aiText) {
  let parsed;
  try {
    parsed = JSON.parse(aiText);
  } catch (error) {
    throw new Error(`AI response was not valid JSON: ${error.message}`);
  }

  const titleUrdu = parsed.title_urdu ?? parsed.urduTitle ?? "";
  const bodyUrdu = parsed.body_urdu ?? parsed.article ?? "";
  const urduSummary = parsed.urdu_summary ?? parsed.urduSummary ?? "";
  const seoTitle = parsed.seo_title ?? parsed.seoTitle ?? "";
  const facebookPost = parsed.facebook_post ?? parsed.facebookPost ?? "";

  const hashtags = Array.isArray(parsed.hashtags)
    ? parsed.hashtags.filter((tag) => typeof tag === "string" && tag.trim())
    : [];

  const category = typeof parsed.category === "string" ? parsed.category.trim() : "";

  return {
    category,
    urduTitle: typeof titleUrdu === "string" ? titleUrdu.trim() : "",
    urduSummary: typeof urduSummary === "string" ? urduSummary.trim() : "",
    seoTitle: typeof seoTitle === "string" ? seoTitle.trim() : "",
    article: typeof bodyUrdu === "string" ? bodyUrdu.trim() : "",
    hashtags: hashtags.join(" "),
    facebookPost: typeof facebookPost === "string" ? facebookPost.trim() : "",
    // Disabled — kept empty so older callers/DB columns stay safe.
    imagePrompt: ""
  };
}

/**
 * Strict validation: Urdu script + full body length (no image requirements).
 */
export function isValidAiResult(result) {
  if (!result?.urduTitle || !result?.urduSummary || !result?.article) {
    return false;
  }
  if (!looksLikeUrdu(result.urduTitle, 8)) return false;
  if (!looksLikeUrdu(result.urduSummary, 16)) return false;
  if (!looksLikeUrdu(result.article, 80)) return false;
  if (result.article.length < MIN_BODY_URDU_CHARS) return false;
  if (paragraphCount(result.article) < 2 && result.article.length < MIN_BODY_URDU_CHARS + 150) {
    return false;
  }
  return true;
}

function buildUserPrompt({ title, rawContent, description }) {
  const sourceText = (rawContent || description || "").trim().slice(0, 5000);

  return `Produce a complete Urdu news package for this story. Follow the system rules and JSON schema exactly.

ENGLISH HEADLINE:
${title}

SOURCE TEXT (English — use as factual basis for a FULL Urdu article in body_urdu):
${sourceText || "(No long source text available — expand carefully from the headline into 3–4 Urdu paragraphs.)"}

Remember:
- title_urdu + body_urdu + urdu_summary MUST be Arabic-script Urdu only.
- body_urdu = full article (3–4 paragraphs), NOT a short blurb.
- Do not invent image prompts or image URLs.`;
}

async function callGemini(item) {
  const prompt = buildUserPrompt(item);

  const response = await fetch(GEMINI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        maxOutputTokens: 4096
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

  const finishReason = data?.candidates?.[0]?.finishReason;
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!content) {
    throw new Error(
      `Gemini API response missing content${finishReason ? ` (finishReason=${finishReason})` : ""}`
    );
  }

  return content;
}

/**
 * Analyze one news item into Urdu content (no image generation).
 *
 * @param {{ title: string, rawContent?: string, description?: string }} item
 * @param {(level: string, message: string, meta?: object) => void} [log]
 */
export async function analyzeNews(item, log = () => {}) {
  if (!item?.title) {
    throw new Error("analyzeNews: item.title is required");
  }

  let lastError;

  for (let attempt = 1; attempt <= AI_MAX_RETRIES + 1; attempt++) {
    try {
      const aiText = await callGemini(item);
      const result = parseAiResponse(aiText);

      if (isValidAiResult(result)) {
        return result;
      }

      lastError = new Error(
        `AI response failed Urdu/full-article validation (titleUrduChars=${countUrduChars(result.urduTitle)}, bodyLen=${result.article?.length || 0})`
      );
      log("warn", `AI response validation failed (attempt ${attempt})`, {
        title: item.title,
        bodyLength: result.article?.length || 0,
        urduTitleChars: countUrduChars(result.urduTitle),
        urduBodyChars: countUrduChars(result.article)
      });
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
