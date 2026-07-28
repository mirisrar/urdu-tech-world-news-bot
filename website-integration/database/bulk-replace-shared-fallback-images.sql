-- Bulk-replace the legacy shared Unsplash newspaper fallback with
-- category-based unique stock covers (same pools as fallbackImages.js).
--
-- Run in Supabase SQL editor AFTER or AFTER deploying the bot fix.
-- This only touches rows still using the old shared photo id.

-- Preview how many rows are affected:
-- SELECT count(*) FROM news
-- WHERE image_url ILIKE '%photo-1504711434969-e33886168f5c%';

WITH pools AS (
  SELECT * FROM (VALUES
    ('business', ARRAY[
      'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&h=630&q=80',
      'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=1200&h=630&q=80',
      'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=1200&h=630&q=80',
      'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1200&h=630&q=80',
      'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?auto=format&fit=crop&w=1200&h=630&q=80',
      'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1200&h=630&q=80',
      'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?auto=format&fit=crop&w=1200&h=630&q=80',
      'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&h=630&q=80',
      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&h=630&q=80',
      'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?auto=format&fit=crop&w=1200&h=630&q=80'
    ]::text[]),
    ('technology', ARRAY[
      'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&h=630&q=80',
      'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&h=630&q=80',
      'https://images.unsplash.com/photo-1531297482031-56bdf0b3cc3c?auto=format&fit=crop&w=1200&h=630&q=80',
      'https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?auto=format&fit=crop&w=1200&h=630&q=80',
      'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1200&h=630&q=80',
      'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1200&h=630&q=80',
      'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=1200&h=630&q=80',
      'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1200&h=630&q=80',
      'https://images.unsplash.com/photo-1555949963-aa79dcee981c?auto=format&fit=crop&w=1200&h=630&q=80',
      'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=1200&h=630&q=80'
    ]::text[]),
    ('default', ARRAY[
      'https://images.unsplash.com/photo-1495020689067-958852a7765e?auto=format&fit=crop&w=1200&h=630&q=80',
      'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&w=1200&h=630&q=80',
      'https://images.unsplash.com/photo-1503694978374-8a3c242346ad?auto=format&fit=crop&w=1200&h=630&q=80',
      'https://images.unsplash.com/photo-1432821596592-e2c18b78144f?auto=format&fit=crop&w=1200&h=630&q=80',
      'https://images.unsplash.com/photo-1475724017904-b712052c192a?auto=format&fit=crop&w=1200&h=630&q=80',
      'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?auto=format&fit=crop&w=1200&h=630&q=80',
      'https://images.unsplash.com/photo-1523995462485-3d171b5c8fa9?auto=format&fit=crop&w=1200&h=630&q=80',
      'https://images.unsplash.com/photo-1566378246598-5b11a0d486cc?auto=format&fit=crop&w=1200&h=630&q=80',
      'https://images.unsplash.com/photo-1504384764586-bb4cdc1707b0?auto=format&fit=crop&w=1200&h=630&q=80',
      'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1200&h=630&q=80'
    ]::text[])
  ) AS t(pool_key, urls)
),
classified AS (
  SELECT
    n.id,
    CASE
      WHEN lower(coalesce(n.category, '')) ~ '(business|economy|finance|market|stock|trade|money)' THEN 'business'
      WHEN lower(coalesce(n.category, '')) ~ '(tech|technology|science|gadget|software|cyber|ai)' THEN 'technology'
      ELSE 'default'
    END AS pool_key,
    -- Stable-ish index from id so rows differ without needing a JS hash.
    (n.id % 10) AS pool_index
  FROM news n
  WHERE n.image_url ILIKE '%photo-1504711434969-e33886168f5c%'
)
UPDATE news AS n
SET image_url = p.urls[c.pool_index + 1]
FROM classified c
JOIN pools p ON p.pool_key = c.pool_key
WHERE n.id = c.id;
