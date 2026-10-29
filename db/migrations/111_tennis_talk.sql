-- 🎾 게임 모집 글마다 댓글 (10/29 대표님 "오픈채팅이 없는데"): 연락처 칸을 비워도 댓글로 참여할 수 있게.
-- 게임마다 숨은 방 tennis-talk 에 숨은 글 하나(seed_key roomchat:tennis:<번호>)를 두고 그 댓글로 쌓는다 (넣어둬 neoTalk 와 같은 방식)
INSERT INTO categories (name, slug, description, sort_order, is_hidden)
VALUES ('🎾 게임 모집 댓글', 'tennis-talk', '테니스 게임 모집마다 달리는 댓글 (방 목록에는 안 나와요)', 9999, true)
ON CONFLICT (slug) DO UPDATE SET is_hidden = true, sort_order = 9999;
