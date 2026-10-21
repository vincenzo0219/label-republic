-- 10/21 운영자 요청: 반려견 방 이름 "애견인의 모임" (주소 slug 는 그대로), 🎨 애니·만화 덕후방 새로 열기
UPDATE categories SET name = '애견인의 모임' WHERE slug = '반려견-덕후방';
UPDATE posts SET title = '💬 애견인의 모임 수다방' WHERE seed_key = 'roomchat:반려견-덕후방';
-- 운영 중인 DB(반려견 방이 있는 곳)에만 — 새로 만든 개발·테스트 DB 의 기본 방 구성은 그대로 둔다
INSERT INTO categories (name, slug, description)
SELECT '애니·만화 덕후방', '애니-만화-덕후방', '애니·만화·웹툰 이야기. 코믹월드·일러스타 같은 행사 정보와 굿즈 전리품 자랑까지.'
 WHERE EXISTS (SELECT 1 FROM categories WHERE slug = '반려견-덕후방')
ON CONFLICT (slug) DO NOTHING;
