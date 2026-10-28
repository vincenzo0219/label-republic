-- 💳 넣어둬 글마다 댓글 · 본 사람 수 (10/28 대표님 "넣어둬도 본 사람수, 댓글 기능 추가")
-- 넣어둬 글마다 숨은 글 하나(seed_key roomchat:neo:<번호>)의 댓글·조회수로 쌓는다. 그 글이 있을 숨은 방 하나 (홈 방 목록·피드에 안 나옴)
INSERT INTO categories (name, slug, description, sort_order, is_hidden)
VALUES ('💳 넣어둬', 'neo', '넣어둬 고민마다 달리는 댓글 (방 목록에는 안 나와요)', 9999, true)
ON CONFLICT (slug) DO UPDATE SET is_hidden = true, sort_order = 9999;
