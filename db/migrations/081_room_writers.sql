-- 10/24 운영자 요청: ✍️ 작가지망생방 (웹소설·웹툰 스토리 쓰는 사람들). 방 이름에 띄어쓰기가 없어 주소도 그대로 /c/작가지망생방
-- 운영 중인 DB(반려견 방이 있는 곳)에만 — 새로 만든 개발·테스트 DB 의 기본 방 구성은 그대로 둔다
INSERT INTO categories (name, slug, description)
SELECT '작가지망생방', '작가지망생방', '웹소설·웹툰 스토리 쓰는 사람들. 공모전·투고 일정, 플롯·1화 고민, 연재 얘기.'
 WHERE EXISTS (SELECT 1 FROM categories WHERE slug = '반려견-덕후방')
ON CONFLICT (slug) DO NOTHING;

-- 수다방 글도 미리 (ensureRoomChat 과 같은 모양) — 1분 테스트 결과가 이 글 댓글로 올라간다
INSERT INTO posts (category_id, nickname, pw_hash, title, body, seed_key, moderated_by, post_type)
SELECT id, '💬 수다방', 'room-chat', '💬 작가지망생방 수다방', '한 줄씩, 편하게 이야기해요.', 'roomchat:작가지망생방', 'room-chat', 'chat'
  FROM categories WHERE slug = '작가지망생방'
ON CONFLICT (seed_key) DO NOTHING;
