/**
 * LIVE SITE PATCH — copy into nexoranewsurdu `js/api.js`
 *
 * Problem: article.js updateSeo() already reads seo_title / seo_description /
 * seo_keywords from the article row, but NEWS_DETAIL_COLUMNS does not select
 * them — so meta/keywords stay on the HTML defaults.
 *
 * Replace the existing NEWS_DETAIL_COLUMNS constant with the line below.
 */

const NEWS_DETAIL_COLUMNS =
  "id, title, urdu_title, category, urdu_summary, seo_title, seo_description, seo_keywords, article, image_url, hashtags, created_at, views, featured, reading_time, image_credit";
