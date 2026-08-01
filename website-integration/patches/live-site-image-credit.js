/**
 * LIVE SITE PATCH — show image attribution (BBC / Al Jazeera / Unsplash…)
 *
 * Bot already stores news.image_credit (e.g. "Image: BBC", "Photo: … / Pexels").
 * Live api.js already selects image_credit on NEWS_DETAIL_COLUMNS.
 * article.js does NOT render it yet — apply the changes below.
 *
 * --- article.html ---
 * Inside .article-image, after <img id="image" …>, add:
 *
 *   <p id="image-credit" class="image-credit" hidden></p>
 *
 * --- css/style.css (optional) ---
 *
 *   .image-credit {
 *     margin: 0.4rem 0 0;
 *     font-size: 0.8rem;
 *     opacity: 0.75;
 *     text-align: start;
 *   }
 *
 * --- js/article.js (inside renderArticle, after setting img.src) ---
 *
 *   const creditEl = document.getElementById("image-credit");
 *   if (creditEl) {
 *     const credit = (data.image_credit || "").trim();
 *     creditEl.textContent = credit;
 *     creditEl.hidden = !credit;
 *   }
 */

export const LIVE_SITE_IMAGE_CREDIT_NOTE =
  "Render news.image_credit under the article hero image.";
