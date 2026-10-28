-- 📣 광고별 유입 (10/28 대표님 "광고별 유입칸 추가해"): 첫 페이지 주소의 광고 표시(utm_campaign, from=ig_ad&c=...)를 남긴다
ALTER TABLE page_views ADD COLUMN IF NOT EXISTS campaign text;
CREATE INDEX IF NOT EXISTS page_views_campaign_day_idx ON page_views (campaign, day) WHERE campaign IS NOT NULL;
CREATE INDEX IF NOT EXISTS page_views_visitor_day_idx ON page_views (visitor_hash, day);
