-- 10/21 운영자 요청: 🏃 러닝 덕후방 새로 열기 (가을 마라톤 시즌)
-- 운영 중인 DB(반려견 방이 있는 곳)에만 — 새로 만든 개발·테스트 DB 의 기본 방 구성은 그대로 둔다
INSERT INTO categories (name, slug, description)
SELECT '러닝 덕후방', '러닝-덕후방', '러닝·마라톤 이야기. 대회 일정·접수, 완주 메달·기록 자랑, 같이 뛸 사람 찾기까지.'
 WHERE EXISTS (SELECT 1 FROM categories WHERE slug = '반려견-덕후방')
ON CONFLICT (slug) DO NOTHING;
