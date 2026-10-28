-- 💳 넣어둬 투표 기간 24시간 → 2일 (10/29 대표님 "투표기간을 2일로").
-- 새 글은 기본값으로, 결말(샀어요/넣어뒀어요)을 아직 안 고른 기존 글은 올린 시각 + 2일로 늘린다.
ALTER TABLE neo_items ALTER COLUMN closes_at SET DEFAULT now() + interval '48 hours';
UPDATE neo_items SET closes_at = created_at + interval '48 hours'
 WHERE outcome IS NULL AND closes_at = created_at + interval '24 hours';
