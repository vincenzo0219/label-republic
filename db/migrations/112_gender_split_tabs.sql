-- 👫 남녀 생각 차이 (10/29 대표님): 미혼남녀방 오늘의 썸 카톡 투표에 "나는 남/여"를 (고른 사람만) 함께 남긴다
ALTER TABLE debate_votes ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('m', 'f'));
-- 탭 클릭 수 (10/29 대표님 "탭 클릭수도 세줘"): 방 주소의 ?head= · ?tab= · ?type= 를 짧은 키로 (예: head:심리, tab:meet)
ALTER TABLE page_views ADD COLUMN IF NOT EXISTS tab varchar(30);
ALTER TABLE page_dwell ADD COLUMN IF NOT EXISTS tab varchar(30);
CREATE INDEX IF NOT EXISTS page_views_room_tab_day_idx ON page_views (category_slug, day) WHERE category_slug IS NOT NULL;
