-- Instant repair for news id=2836 (run in Supabase SQL editor).
-- Replaces motherboard/CPU stock with a non-tech cover already uploaded
-- to Storage. Prefer the Actions repair_image job after merging PR #35
-- if you want Dawn og:image / topic stock instead.

UPDATE news
SET
  image_url = 'https://afrwjstlffvsueqjtjyd.supabase.co/storage/v1/object/public/news-images/repair/2836-ctd-okara.webp',
  image_credit = 'Source: Unsplash'
WHERE id = 2836;

-- Verify:
-- SELECT id, image_url, image_credit FROM news WHERE id = 2836;
