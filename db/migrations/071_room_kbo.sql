-- 10/21 운영자 요청: ⚾ KBO 덕후방 새로 열기 (가을야구 시즌)
-- 운영 중인 DB(반려견 방이 있는 곳)에만 — 새로 만든 개발·테스트 DB 의 기본 방 구성은 그대로 둔다
INSERT INTO categories (name, slug, description)
SELECT 'KBO 덕후방', 'kbo-덕후방', 'KBO 야구 이야기. 직관 후기·응원가·굿즈 자랑과 경기·팬 행사 정보까지.'
 WHERE EXISTS (SELECT 1 FROM categories WHERE slug = '반려견-덕후방')
ON CONFLICT (slug) DO NOTHING;
