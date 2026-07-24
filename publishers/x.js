/**
 * X (Twitter) API v2 publisher.
 *
 * Requires: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET
 * (a "Consumer Key/Secret" pair from the X Developer Portal, plus an
 * "Access Token/Secret" pair generated for the account that should post —
 * these are static, so no interactive OAuth flow is needed for a cron bot).
 *
 * Posting requires OAuth 1.0a user-context request signing — a plain
 * bearer token is app-only and cannot create posts on v2's /tweets
 * endpoint. This module implements the signing manually (HMAC-SHA1) using
 * Node's built-in `crypto`, rather than adding an OAuth dependency.
 */

import crypto from "node:crypto";

const X_API_URL = "https://api.twitter.com/2/tweets";
const MAX_TWEET_LENGTH = 280;

function percentEncode(value) {
  // OAuth1.0a requires RFC 3986 encoding, which encodeURIComponent doesn't
  // quite do out of the box (it leaves !*'() unescaped).
  return encodeURIComponent(value).replace(
    /[!*'()]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function buildOAuthHeader({ method, url, consumerKey, consumerSecret, accessToken, accessTokenSecret }) {
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: accessToken,
    oauth_version: "1.0"
  };

  // The request body is JSON (not form-encoded), so per the OAuth1.0a spec
  // only the oauth_* parameters themselves participate in the signature
  // base string here (there's no query string on this endpoint either).
  const sortedParamString = Object.keys(oauthParams)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(oauthParams[key])}`)
    .join("&");

  const signatureBase = [method.toUpperCase(), percentEncode(url), percentEncode(sortedParamString)].join(
    "&"
  );
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(accessTokenSecret)}`;
  const signature = crypto.createHmac("sha1", signingKey).update(signatureBase).digest("base64");

  const headerParams = { ...oauthParams, oauth_signature: signature };
  const headerString = Object.keys(headerParams)
    .sort()
    .map((key) => `${percentEncode(key)}="${percentEncode(headerParams[key])}"`)
    .join(", ");

  return `OAuth ${headerString}`;
}

/**
 * Publishes a short post to X, composed from the Urdu title + source link
 * (truncated to fit X's 280-character limit).
 *
 * @param {object} payload
 * @param {string} payload.urduTitle
 * @param {string} [payload.sourceUrl]
 * @returns {Promise<{ published: true, id: string }>}
 * @throws {Error} If required env vars are missing, the request fails, or X returns an error.
 */
export async function publishToX({ urduTitle, sourceUrl }) {
  const consumerKey = process.env.X_API_KEY;
  const consumerSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;

  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
    throw new Error(
      "X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, and X_ACCESS_TOKEN_SECRET must all be set"
    );
  }

  const linkSuffix = sourceUrl ? `\n\n${sourceUrl}` : "";
  const maxTitleLength = Math.max(0, MAX_TWEET_LENGTH - linkSuffix.length);
  const text = `${(urduTitle || "").slice(0, maxTitleLength)}${linkSuffix}`.trim();

  if (!text) {
    throw new Error("publishToX: no content to post");
  }

  const authHeader = buildOAuthHeader({
    method: "POST",
    url: X_API_URL,
    consumerKey,
    consumerSecret,
    accessToken,
    accessTokenSecret
  });

  let response;
  try {
    response = await fetch(X_API_URL, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text })
    });
  } catch (networkError) {
    throw new Error(`X request failed (network error): ${networkError.message}`);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.errors) {
    const detail = data?.detail || data?.title || data?.errors?.[0]?.message || response.statusText;
    throw new Error(`X API error (HTTP ${response.status}): ${detail}`);
  }

  const tweetId = data?.data?.id;
  if (!tweetId) {
    throw new Error("X API response missing a tweet id");
  }

  return { published: true, id: tweetId };
}
