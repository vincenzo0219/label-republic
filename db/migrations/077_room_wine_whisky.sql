-- 10/22 운영자 요청: 🍷 와인·위스키 덕후방 (술 이야기는 성인만 — 판매·구매 연결 글 금지)
-- 운영 중인 DB(반려견 방이 있는 곳)에만 — 새로 만든 개발·테스트 DB 의 기본 방 구성은 그대로 둔다
INSERT INTO categories (name, slug, description)
SELECT '와인·위스키 덕후방', '와인-위스키-덕후방', '만 19세 이상만. 와인·위스키 이야기 — 오늘 마신 한 잔, 테이스팅 노트, 페어링, 시음회·페어 소식. 술 사고팔기·거래 글은 안 돼요.'
 WHERE EXISTS (SELECT 1 FROM categories WHERE slug = '반려견-덕후방')
ON CONFLICT (slug) DO NOTHING;
